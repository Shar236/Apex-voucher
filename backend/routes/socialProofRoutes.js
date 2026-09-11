import { Router } from 'express';
import {
  streamPurchaseEvents,
  socialProofHealth,
  getRecentPurchaseEvents,
} from '../controllers/socialProofController.js';

const r = Router();

// Public, read-only, no auth. The purchase events themselves are produced only
// by the verified-payment fulfilment gate (services/purchaseProof.js).
r.get('/stream', streamPurchaseEvents);
r.get('/recent', getRecentPurchaseEvents);
r.get('/health', socialProofHealth);

export default r;
