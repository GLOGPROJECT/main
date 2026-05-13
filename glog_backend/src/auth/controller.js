const axios = require('axios');
const prisma = require('../config/db');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('./jwt');
const { getRandomLandCoordinates } = require('../utils/landCoordinates');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

const REFRESH_TOKEN_EXPIRES_DAYS = 30;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  path: '/',
};

// GET /api/auth/github
// GitHub OAuth 시작 - GitHub 로그인 페이지로 리다이렉트
function redirectToGithub(req, res) {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'read:user user:email',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

// GET /api/auth/github/callback
// GitHub 콜백 처리 - 코드 교환 → 유저 조회/생성 → JWT 발급
async function githubCallback(req, res) {
  const { code, error } = req.query;

  if (error === 'access_denied') {
    return res.redirect(`${FRONTEND_URL}/?error=access_denied`);
  }
  if (!code) {
    return res.redirect(`${FRONTEND_URL}/?error=no_code`);
  }

  try {
    // 1. GitHub에서 access token 교환
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code },
      { headers: { Accept: 'application/json' } }
    );

    const githubAccessToken = tokenResponse.data.access_token;
    if (!githubAccessToken) {
      return res.redirect(`${FRONTEND_URL}/?error=token_exchange_failed`);
    }

    // 2. GitHub 유저 정보 조회
    const [userResponse, emailsResponse] = await Promise.all([
      axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${githubAccessToken}` },
      }),
      axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${githubAccessToken}` },
      }),
    ]);

    const githubUser = userResponse.data;
    const primaryEmail = emailsResponse.data.find((e) => e.primary && e.verified)?.email || null;

    if (!githubUser.id) {
      return res.redirect(`${FRONTEND_URL}/?error=github_user_fetch_failed`);
    }

    const githubId = String(githubUser.id);

    // 3. DB에서 유저 조회 또는 생성
    let user = await prisma.user.findUnique({ where: { github_id: githubId } });
    let isNew = false;

    if (!user) {
      // 신규 가입: 닉네임 중복 처리
      let nickname = githubUser.login;
      const nicknameExists = await prisma.user.findUnique({ where: { nickname } });
      if (nicknameExists) {
        nickname = `${githubUser.login}_${Date.now().toString().slice(-4)}`;
      }
      // 20자 제한
      nickname = nickname.slice(0, 20);

      user = await prisma.user.create({
        data: {
          github_id: githubId,
          nickname,
          avatar_url: githubUser.avatar_url,
          email: primaryEmail,
          is_setup_complete: false,
          github_access_token: githubAccessToken,
          github_login: githubUser.login || null,
        },
      });
      isNew = true;
    } else {
      // 기존 유저: 탈퇴 여부 확인
      if (user.is_deleted) {
        return res.redirect(`${FRONTEND_URL}/?error=account_deleted`);
      }
      // 재로그인 시 GitHub 프로필 사진만 동기화
      user = await prisma.user.update({
        where: { user_id: user.user_id },
        data: {
          avatar_url: githubUser.avatar_url,
          github_access_token: githubAccessToken,
          github_login: githubUser.login || null,
        },
      });
    }

    // 4. JWT 토큰 발급
    const tokenPayload = { userId: user.user_id, githubId: user.github_id };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    // 5. Refresh Token DB 저장
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await prisma.refreshToken.create({
      data: { user_id: user.user_id, token: refreshToken, expires_at: expiresAt, is_revoked: false },
    });

    // 6. Refresh Token → httpOnly 쿠키, Access Token → 프론트엔드 리다이렉트
    res.cookie('refresh_token', refreshToken, COOKIE_OPTIONS);

    const redirectUrl = `${FRONTEND_URL}/auth/callback?token=${accessToken}&is_new=${isNew}&setup=${user.is_setup_complete}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('[GitHub OAuth Error]', err.message, err.stack);
    const msg = String(err.message || '');
    if (
      /last_daily_coin_ymd|daily_contribution/i.test(msg) &&
      /Unknown column|does not exist in the current database/i.test(msg)
    ) {
      return res.redirect(`${FRONTEND_URL}/?error=db_migration_required`);
    }
    res.redirect(`${FRONTEND_URL}/?error=server_error`);
  }
}

// POST /api/auth/refresh
// Refresh Token으로 Access Token 재발급
async function refreshAccessToken(req, res) {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: { token: refreshToken, is_revoked: false },
    });

    if (!tokenRecord || tokenRecord.expires_at < new Date()) {
      res.clearCookie('refresh_token');
      return res.status(401).json({ message: '세션이 만료되었습니다. 다시 로그인해주세요.' });
    }

    const user = await prisma.user.findUnique({ where: { user_id: payload.userId } });
    if (!user || user.is_deleted) {
      res.clearCookie('refresh_token');
      return res.status(401).json({ message: '존재하지 않는 계정입니다.' });
    }

    const newAccessToken = signAccessToken({ userId: user.user_id, githubId: user.github_id });
    res.json({ accessToken: newAccessToken });
  } catch {
    res.clearCookie('refresh_token');
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}

// POST /api/auth/logout
// 로그아웃: Refresh Token 무효화 + 쿠키 삭제
async function logout(req, res) {
  const refreshToken = req.cookies.refresh_token;

  res.clearCookie('refresh_token', { path: '/' });

  if (refreshToken) {
    try {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { is_revoked: true },
      });
    } catch (err) {
      console.error('[Logout DB Error]', err.message);
    }
  }

  res.json({ message: '로그아웃 완료' });
}

// GET /api/auth/me
// 현재 로그인 유저 정보 조회
async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: req.user.userId },
      include: {
        tech_stacks: true,
        coding_streak: true,
        user_status: true,
      },
    });

    if (!user || user.is_deleted) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      user_id: user.user_id,
      github_id: user.github_id,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      email: user.email,
      bio: user.bio,
      country: user.country,
      globe_lat: user.globe_lat,
      globe_lon: user.globe_lon,
      coins: user.coins,
      is_private: user.is_private,
      is_setup_complete: user.is_setup_complete,
      tech_stacks: user.tech_stacks.map((t) => t.stack_name),
      current_streak: user.coding_streak?.current_streak ?? 0,
      max_streak: user.coding_streak?.max_streak ?? 0,
      status: user.user_status?.status ?? 'offline',
    });
  } catch (err) {
    console.error('[GetMe Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
}

// POST /api/auth/setup
// 초기 설정 완료 처리 (신규 가입 후 최초 1회)
async function completeSetup(req, res) {
  const { country, bio, tech_stacks } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { user_id: req.user.userId } });
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    if (user.is_setup_complete) return res.status(400).json({ message: '이미 초기 설정이 완료되었습니다.' });

    const stackList = Array.isArray(tech_stacks) ? tech_stacks.slice(0, 5) : [];

    const { lat, lon } = getRandomLandCoordinates();

    await prisma.$transaction([
      prisma.user.update({
        where: { user_id: user.user_id },
        data: {
          bio: bio?.slice(0, 100) || null,
          country: country || null,
          globe_lat: lat,
          globe_lon: lon,
          is_setup_complete: true,
        },
      }),
      prisma.userTechStack.deleteMany({ where: { user_id: user.user_id } }),
      ...(stackList.length > 0
        ? [
            prisma.userTechStack.createMany({
              data: stackList.map((stack_name) => ({ user_id: user.user_id, stack_name })),
            }),
          ]
        : []),
      prisma.codingStreak.upsert({
        where: { user_id: user.user_id },
        create: { user_id: user.user_id },
        update: {},
      }),
      prisma.userStatus.upsert({
        where: { user_id: user.user_id },
        create: { user_id: user.user_id, status: 'offline' },
        update: {},
      }),
    ]);

    res.json({ message: '초기 설정 완료', globe_lat: lat, globe_lon: lon });
  } catch (err) {
    console.error('[Setup Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
}

module.exports = { redirectToGithub, githubCallback, refreshAccessToken, logout, getMe, completeSetup };
