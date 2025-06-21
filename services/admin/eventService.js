const Event = require('../../models/eventsModel');

const getAllEvents = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      search,
      sortBy = 'dateTime',
      sortOrder = 'asc',
    } = options;

    const query = {};

    if (category) query.category = category;
    if (status) query.status = status;
    if (search && search.trim() !== '') {
      query.title = new RegExp(search.trim(), 'i');
    }

    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    const sortCriteria = { [sortBy]: sortDirection };
    const skip = (Math.max(page, 1) - 1) * Math.max(limit, 1);

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Event.countDocuments(query).exec(),
    ]);

    return { events, total, page: Number(page), limit: Number(limit) };
  } catch (error) {
    throw new Error(`Could not fetch events: ${error.message}`);
  }
};

const getEventById = async (id) => {
  try {
    const event = await Event.findById(id).lean().exec();
    if (!event) {
      throw new Error('Event not found.');
    }
    return event;
  } catch (error) {
    if (error.message.includes('not found')) throw error;
    throw new Error(`Could not fetch event: ${error.message}`);
  }
};

const createEvent = async (eventData, files = {}) => {
  try {
    if (files.coverImage && files.coverImage[0]) {
      eventData.coverImage = `/uploads/events/${files.coverImage[0].filename}`;
    }
    if (files.gallery) {
      eventData.gallery = files.gallery.map(f => `/uploads/events/${f.filename}`);
    }

    const event = new Event(eventData);
    return await event.save();
  } catch (error) {
    throw new Error(`Could not create event: ${error.message}`);
  }
};


const updateEvent = async (id, updateData) => {
  try {
    const event = await Event.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!event) {
      throw new Error('Event not found.');
    }
    return event;
  } catch (error) {
    throw new Error(`Could not update event: ${error.message}`);
  }
};

const deleteEvent = async (id) => {
  try {
    const result = await Event.findByIdAndDelete(id);
    if (!result) {
      throw new Error('Event not found.');
    }
    return { message: 'Event successfully deleted.' };
  } catch (error) {
    throw new Error(`Could not delete event: ${error.message}`);
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
};
