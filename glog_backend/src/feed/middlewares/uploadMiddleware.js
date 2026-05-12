/**
 * 게시글 이미지 업로드 (multer, 로컬 디스크).
 * 추후 S3: storage 팩토리만 교체하고 동일한 fileFilter/limits/에러 매핑을 유지하면 됨.
 * @see md/F01Feed.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { MulterError } = multer;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;
const FIELD_NAME = 'images';

/** 로컬 저장 루트 (S3 전환 시 버킷 prefix 등으로 대체) */
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function extFromMimetype(mimetype) {
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/gif') return '.gif';
  if (mimetype === 'image/webp') return '.webp';
  return '';
}

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

// 추후 S3: multer.memoryStorage() + 업로드 서비스로 스트림 전달
const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      ensureUploadDir();
      cb(null, UPLOAD_ROOT);
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    const ext = extFromMimetype(file.mimetype) || path.extname(file.originalname || '').toLowerCase();
    const safe = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.bin';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safe}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: MAX_FILES,
  },
  /** UTF-8 필드(본문·해시태그 JSON·link_preview JSON 등). latin1 기본값이면 한글 OG 메타에서 링크 JSON 파싱 실패 */
  defParamCharset: 'utf8',
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      const err = new Error('INVALID_FILE_TYPE');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

const parser = upload.array(FIELD_NAME, MAX_FILES);

function sendInvalidType(res) {
  res.status(400).json({
    error: '허용되지 않는 파일 형식입니다',
    code: 'INVALID_FILE_TYPE',
  });
}

function sendTooLarge(res) {
  res.status(400).json({
    error: '파일 크기는 5MB를 초과할 수 없습니다',
    code: 'FILE_TOO_LARGE',
  });
}

function sendTooMany(res) {
  res.status(400).json({
    error: '이미지는 최대 4장까지 첨부 가능합니다',
    code: 'TOO_MANY_FILES',
  });
}

/**
 * 게시글 작성/수정용 multipart 처리.
 * 필드명 `images`, 최대 4장, 장당 5MB, MIME jpg/jpeg/png/gif/webp.
 * multipart가 아닌 요청은 그대로 통과(req.files 없음).
 */
function uploadImages(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next();

    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendTooLarge(res);
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return sendTooMany(res);
      }
    }

    if (err && err.code === 'INVALID_FILE_TYPE') {
      return sendInvalidType(res);
    }

    return next(err);
  });
}

module.exports = {
  uploadImages,
  UPLOAD_ROOT,
  MAX_FILE_BYTES,
  MAX_FILES,
  FIELD_NAME,
};
