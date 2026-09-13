import { Router } from 'express';
import { getPublicPTEBookingCatalog } from '../controllers/pteBookingProductController.js';

// Public, unauthenticated storefront catalog for the PTE Exam Booking section.
// Mounted at /api/pte-booking-catalog (read-only, no rate limiting needed).
const r = Router();

r.get('/', getPublicPTEBookingCatalog);

export default r;