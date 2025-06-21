const eventService = require("../../services/admin/eventService.js");

const getAllEvents = async (req, res) => {
  try {
    const result = await eventService.getAllEvents(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await eventService.getEventById(id);
    res.status(200).json(event);
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

const createEvent = async (req, res) => {
  try {
    const coverImagePath = req.file ? req.file.path : null;

    const eventData = {
      ...req.body,
      coverImage: coverImagePath,
    };

    const event = await eventService.createEvent(eventData);
    res.status(201).json(event);
  } catch (error) {
    if (
      error.name === "ValidationError" ||
      error.message.includes("required") ||
      error.message.includes("invalid")
    ) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const coverImagePath = req.file?.path;

    const updateData = { ...req.body };

    // Sanitize: if coverImage exists and is an object, remove it
    if (updateData.coverImage && typeof updateData.coverImage === "object") {
      delete updateData.coverImage;
    }

    // If file was uploaded, override coverImage path
    if (coverImagePath) {
      updateData.coverImage = coverImagePath;
    }

    const event = await eventService.updateEvent(id, updateData);
    res.status(200).json(event);
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};


const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await eventService.deleteEvent(id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
};
