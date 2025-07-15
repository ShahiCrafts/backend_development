const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');

router.get('/fetch/all', categoryController.getAllCategories);
router.get('/fetch/:id', categoryController.getCategoryById);
router.post('/create', categoryController.createCategory);
router.put('/update/:id', categoryController.updateCategory);
router.delete('/delete/:id', categoryController.deleteCategory);

module.exports = router;
