const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authenticate = require('../auth/middleware');

// POST /api/dm/rooms
// 상대방과의 DM 방 생성 또는 기존 방 반환
router.post('/rooms', authenticate, async (req, res) => {
  const myId = req.user.userId;
  const { partner_id } = req.body;

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

module.exports = router;
