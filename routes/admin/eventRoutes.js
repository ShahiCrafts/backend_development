const express = require('express');
const router = express.Router();
const eventController = require('../../controllers/admin/eventController');
const upload = require('../../middleware/upload');

router.get('/', eventController.getAllEvents);

router.get('/:id', eventController.getEventById);

router.post('/', upload.single('coverImage'), eventController.createEvent);

router.put('/:id', upload.single('coverImage'), eventController.updateEvent);

router.delete('/:id', eventController.deleteEvent);

module.exports = router;
