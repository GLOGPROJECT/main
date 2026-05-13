require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const { verifyAccessToken } = require('./auth/jwt');
const prisma = require('./config/db');

const app = express();
const server = http.createServer(app);

// Socket.io 서버 — 프론트와 같은 origin 허용
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api', require('./routes/index'));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Socket.io DM 처리 ──

// 소켓 인증 미들웨어 — 연결 시 Bearer 토큰 검증
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('인증 토큰이 없습니다.'));
  try {
    socket.user = verifyAccessToken(token);
    next();
  } catch {
    next(new Error('토큰이 유효하지 않습니다.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.userId;

  // 본인 userId로 room join — 다른 유저가 메시지 보낼 때 이 room으로 emit
  socket.join(`user:${userId}`);

  // DM 메시지 전송 이벤트
  // payload: { room_id, content }
  socket.on('dm:send', async ({ room_id, content }) => {
    if (!content?.trim()) return;

    try {
      // 해당 DM 방에 본인이 참여자인지 검증
      const room = await prisma.dmRoom.findFirst({
        where: {
          id: room_id,
          OR: [{ user1_id: userId }, { user2_id: userId }],
        },
      });
      if (!room) return socket.emit('dm:error', { message: '권한이 없습니다.' });

      // DB에 메시지 저장
      const message = await prisma.dmMessage.create({
        data: { room_id, sender_id: userId, content: content.trim() },
        include: { sender: { select: { user_id: true, nickname: true, avatar_url: true } } },
      });

      const payload = {
        id: message.id,
        room_id,
        sender_id: userId,
        sender: message.sender,
        content: message.content,
        status: message.status,
        created_at: message.created_at,
      };

      // 상대방 room에 새 메시지 emit
      const recipientId = room.user1_id === userId ? room.user2_id : room.user1_id;
      io.to(`user:${recipientId}`).emit('dm:receive', payload);

      // 본인에게도 전송 확인 emit (자신의 메시지 UI에 추가)
      socket.emit('dm:sent', payload);
    } catch (err) {
      console.error('[dm:send error]', err.message);
      socket.emit('dm:error', { message: '메시지 전송에 실패했습니다.' });
    }
  });

  // 메시지 읽음 처리 — 대화방 열 때 호출
  // payload: { room_id }
  socket.on('dm:read', async ({ room_id }) => {
    try {
      await prisma.dmMessage.updateMany({
        where: { room_id, sender_id: { not: userId }, status: { not: 'read' } },
        data: { status: 'read' },
      });
    } catch (err) {
      console.error('[dm:read error]', err.message);
    }
  });

  socket.on('project:join', (projectId) => {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    socket.join(`project:${id}`);
  });

  socket.on('project:leave', (projectId) => {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    socket.leave(`project:${id}`);
  });

  socket.on('disconnect', () => {
    socket.leave(`user:${userId}`);
  });
});

// io 인스턴스를 REST 라우터에서도 쓸 수 있도록 app에 저장
app.set('io', io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
