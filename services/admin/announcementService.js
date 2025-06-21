const Announcement = require('../../models/announcementModel.js');

const getAllAnnouncements = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      isPinned,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const query = {};

    if (category) query.category = category;
    if (typeof isPinned === 'boolean') query.isPinned = isPinned;
    if (search && search.trim() !== '') {
      query.title = new RegExp(search.trim(), 'i');
    }

    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    const sortCriteria = { isPinned: -1, [sortBy]: sortDirection };
    const skip = (Math.max(page, 1) - 1) * Math.max(limit, 1);

    const [announcements, total] = await Promise.all([
      Announcement.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Announcement.countDocuments(query).exec(),
    ]);

    return { announcements, total, page: Number(page), limit: Number(limit) };
  } catch (error) {
    throw new Error(`Could not fetch announcements: ${error.message}`);
  }
};

const getAnnouncementById = async (id) => {
  try {
    const announcement = await Announcement.findById(id).lean().exec();
    if (!announcement) {
      throw new Error('Announcement not found.');
    }
    return announcement;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    throw new Error(`Could not fetch announcement: ${error.message}`);
  }
};

const createAnnouncement = async (announcementData) => {
  try {
    const announcement = new Announcement(announcementData);
    return await announcement.save();
  } catch (error) {
    throw error;
  }
};

const updateAnnouncement = async (id, updateData) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!announcement) {
      throw new Error('Announcement not found.');
    }
    return announcement;
  } catch (error) {
    throw error;
  }
};

const deleteAnnouncement = async (id) => {
  try {
    const result = await Announcement.findByIdAndDelete(id);
    if (!result) {
      throw new Error('Announcement not found.');
    }
    return { message: 'Announcement successfully deleted.' };
  } catch (error) {
    throw new Error(`Could not delete announcement: ${error.message}`);
  }
};

module.exports = {
  getAllAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
