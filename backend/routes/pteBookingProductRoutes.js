import { Router } from 'express';
import { productImageUpload } from '../middleware/upload.js';
import {
  listPTEBookingProductsAdmin,
  getPTEBookingProductAdmin,
  createPTEBookingProductAdmin,
  updatePTEBookingProductAdmin,
  deletePTEBookingProductAdmin,
  reorderPTEBookingProductsAdmin,
  publishPTEBookingProductAdmin,
  unpublishPTEBookingProductAdmin,
  uploadPTEBookingImageAdmin,
  removePTEBookingImageAdmin,
  getPTEBookingConfigAdmin,
  updatePTEBookingConfigAdmin,
} from '../controllers/pteBookingProductController.js';

// Mounted at /api/admin — literal paths are declared before '/:id' so they are
// never shadowed by the parameterised routes (same pattern as /products).
const r = Router();

// Page-level content
r.get('/pte-booking/config', getPTEBookingConfigAdmin);
r.put('/pte-booking/config', updatePTEBookingConfigAdmin);

// Products (literal paths first)
r.get('/pte-booking-products', listPTEBookingProductsAdmin);
r.post('/pte-booking-products', createPTEBookingProductAdmin);
r.post('/pte-booking-products/image-upload', productImageUpload.single('image'), uploadPTEBookingImageAdmin);
r.patch('/pte-booking-products/reorder', reorderPTEBookingProductsAdmin);
r.get('/pte-booking-products/:id', getPTEBookingProductAdmin);
r.patch('/pte-booking-products/:id', updatePTEBookingProductAdmin);
r.delete('/pte-booking-products/:id', deletePTEBookingProductAdmin);
r.patch('/pte-booking-products/:id/publish', publishPTEBookingProductAdmin);
r.patch('/pte-booking-products/:id/unpublish', unpublishPTEBookingProductAdmin);
r.patch('/pte-booking-products/:id/image', removePTEBookingImageAdmin);

export default r;