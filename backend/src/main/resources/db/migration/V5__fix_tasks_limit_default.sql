-- Починка аккаунтов, созданных через @Builder без @Builder.Default:
-- tasks_limit остался 0 вместо 100 из-за бага Lombok.
UPDATE users
SET tasks_limit = 100
WHERE tasks_limit = 0;
