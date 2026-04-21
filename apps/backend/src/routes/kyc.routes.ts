import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { kycUpload } from '../middleware/upload.middleware';
import {
  uploadKycDocumentsHandler,
  getKycStatusHandler,
} from '../controllers/kyc.controller';

const router = Router();

router.use(authMiddleware);

router.get('/status', getKycStatusHandler);
router.post(
  '/documents',
  kycUpload.fields([
    { name: 'front',  maxCount: 1 },
    { name: 'back',   maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  uploadKycDocumentsHandler,
);

export default router;
