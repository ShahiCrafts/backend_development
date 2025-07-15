const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIRECTORY = 'uploads/';

/**
 * A factory function to create a configured Multer instance.
 * @param {object} options - The configuration options.
 * @param {string} options.subfolder - The subfolder within the main upload directory (e.g., 'posts', 'attachments').
 * @param {string[]} options.allowedMimeTypes - An array of allowed MIME types.
 * @param {number} options.fileSizeLimit - The maximum file size in bytes.
 * @returns A configured Multer instance.
 */
const createUploader = (options) => {
  // 1. Ensure the destination directory exists
  const destinationPath = path.join(UPLOAD_DIRECTORY, options.subfolder);
  fs.mkdirSync(destinationPath, { recursive: true });

  // 2. Configure storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destinationPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });

  // 3. Configure file filter
  const fileFilter = (req, file, cb) => {
    if (options.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${options.subfolder} supported types are allowed.`));
    }
  };

  // 4. Return the configured multer instance
  return multer({
    storage,
    fileFilter,
    limits: { fileSize: options.fileSizeLimit },
  });
};

// --- Pre-configured Uploaders ---

// Uploader for Chat Attachments (Images, PDFs, Docs)
const chatAttachmentTypes = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const uploadChatAttachment = createUploader({
  subfolder: 'attachments',
  allowedMimeTypes: chatAttachmentTypes,
  fileSizeLimit: 10 * 1024 * 1024, // 10MB
});


// Uploader for Post Images (Images Only)
const postImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const uploadPostImage = createUploader({
  subfolder: 'posts',
  allowedMimeTypes: postImageTypes,
  fileSizeLimit: 5 * 1024 * 1024, // 5MB
});


// Uploader for Profile Avatars (Small Images Only)
const avatarImageTypes = ['image/jpeg', 'image/png'];
const uploadAvatar = createUploader({
  subfolder: 'avatars',
  allowedMimeTypes: avatarImageTypes,
  fileSizeLimit: 2 * 1024 * 1024, // 2MB
});


// Export the specific uploaders
module.exports = {
  uploadChatAttachment,
  uploadPostImage,
  uploadAvatar,
};