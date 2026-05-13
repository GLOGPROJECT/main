const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authenticate = require('../auth/middleware');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

// S3 클라이언트 설정 — .env의 AWS 자격증명 사용
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// multer-s3 설정 — S3 dmfile 폴더에 저장, 50MB 제한, 이미지/문서 허용
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      // dmfile/타임스탬프-랜덤.확장자 형태로 저장
      const ext = path.extname(file.originalname);
      cb(null, `dmfile/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    // 이미지 + 일반 문서 허용, 동영상 제외
    const allowed = /image\/(jpeg|png|gif|webp)|application\/(pdf|zip|msword|vnd\.openxmlformats|octet-stream)|text\//;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('지원하지 않는 파일 형식입니다.'));
  },
});

// POST /api/dm/rooms
// 상대방과의 DM 방 생성 또는 기존 방 반환
router.post('/rooms', authenticate, async (req, res) => {
  const myId = req.user.userId;
  const partner_id = parseInt(req.body.partner_id);

  if (!partner_id || partner_id === myId) {
    return res.status(400).json({ message: '유효하지 않은 상대방입니다.' });
  }

  try {
    // user1_id < user2_id 정렬로 중복 방 생성 방지
    const [user1_id, user2_id] = myId < partner_id
      ? [myId, partner_id]
      : [partner_id, myId];

    let room = await prisma.dmRoom.findFirst({
      where: { user1_id, user2_id },
      include: {
        user1: { select: { user_id: true, nickname: true, avatar_url: true } },
        user2: { select: { user_id: true, nickname: true, avatar_url: true } },
      },
    });

    if (!room) {
      room = await prisma.dmRoom.create({
        data: { user1_id, user2_id },
        include: {
          user1: { select: { user_id: true, nickname: true, avatar_url: true } },
          user2: { select: { user_id: true, nickname: true, avatar_url: true } },
        },
      });
    }

    res.json(room);
  } catch (err) {
    console.error('[CreateRoom Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/dm/rooms
// 내가 참여한 모든 DM 방 목록 (마지막 메시지 + 안읽음 수 포함)
router.get('/rooms', authenticate, async (req, res) => {
  const myId = req.user.userId;

  try {
    const rooms = await prisma.dmRoom.findMany({
      where: { OR: [{ user1_id: myId }, { user2_id: myId }] },
      include: {
        user1: { select: { user_id: true, nickname: true, avatar_url: true } },
        user2: { select: { user_id: true, nickname: true, avatar_url: true } },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // 각 방의 안읽음 메시지 수 계산
    const result = await Promise.all(rooms.map(async (room) => {
      const unread = await prisma.dmMessage.count({
        where: { room_id: room.id, sender_id: { not: myId }, status: { not: 'read' } },
      });

      // 상대방 정보만 추출
      const partner = room.user1_id === myId ? room.user2 : room.user1;

      return {
        id: room.id,
        partner,
        last_message: room.messages[0] ?? null,
        unread_count: unread,
        created_at: room.created_at,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('[GetRooms Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// GET /api/dm/rooms/:roomId/messages
// 특정 방의 메시지 목록 (최신순, 페이지네이션)
router.get('/rooms/:roomId/messages', authenticate, async (req, res) => {
  const myId = req.user.userId;
  const roomId = parseInt(req.params.roomId);
  const cursor = req.query.cursor ? parseInt(req.query.cursor) : undefined;
  const limit = 30;

  try {
    // 방 참여자 검증
    const room = await prisma.dmRoom.findFirst({
      where: { id: roomId, OR: [{ user1_id: myId }, { user2_id: myId }] },
    });
    if (!room) return res.status(403).json({ message: '접근 권한이 없습니다.' });

    const messages = await prisma.dmMessage.findMany({
      where: {
        room_id: roomId,
        is_deleted: false,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: { sender: { select: { user_id: true, nickname: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    // 오래된 순으로 뒤집어서 반환 (화면에서 위→아래 흐름)
    res.json(messages.reverse());
  } catch (err) {
    console.error('[GetMessages Error]', err.message);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// POST /api/dm/upload
// 파일 업로드 후 URL 반환 — 이후 dm:send 소켓 이벤트로 전송
router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '파일이 없습니다.' });

  const fileUrl = req.file.location;
  const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
  console.log('[DM Upload]', { mimetype: req.file.mimetype, fileType, fileUrl });

  res.json({ file_url: fileUrl, file_type: fileType, original_name: req.file.originalname });
});

module.exports = router;
