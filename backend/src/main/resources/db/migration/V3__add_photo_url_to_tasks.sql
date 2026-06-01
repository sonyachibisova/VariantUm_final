-- Поле для хранения URL или base64-данных прикреплённого изображения к заданию
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS photo_url TEXT;
