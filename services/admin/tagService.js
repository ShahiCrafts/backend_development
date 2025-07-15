const Tag = require("../../models/tagModel");

const getAllTags = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      isActive,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = {};
    if (typeof isActive === "boolean") query.isActive = isActive;
    if (search && search.trim() !== "") {
      query.name = new RegExp(search.trim(), "i");
    }

    const sortDirection = sortOrder.toLowerCase() === "asc" ? 1 : -1;
    const sortCriteria = { [sortBy]: sortDirection };
    const skip = (Math.max(page, 1) - 1) * Math.max(limit, 1);

    const [tags, total] = await Promise.all([
      Tag.find(query).sort(sortCriteria).skip(skip).limit(limit).lean().exec(),
      Tag.countDocuments(query).exec(),
    ]);

    return { tags, total, page: Number(page), limit: Number(limit) };
  } catch (error) {
    throw new Error(`Could not fetch tags: ${error.message}`);
  }
};

const getTagById = async (id) => {
  try {
    const tag = await Tag.findById(id).lean().exec();
    if (!tag) throw new Error("Tag not found.");
    return tag;
  } catch (error) {
    throw new Error(`Could not fetch tag: ${error.message}`);
  }
};

const createTag = async (tagData) => {
  try {
    const tag = new Tag(tagData);
    return await tag.save();
  } catch (error) {
    throw new Error(`Could not create tag: ${error.message}`);
  }
};

const updateTag = async (id, updateData) => {
  try {
    const tag = await Tag.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!tag) throw new Error("Tag not found.");
    return tag;
  } catch (error) {
    throw new Error(`Could not update tag: ${error.message}`);
  }
};

// Delete a tag by ID
const deleteTag = async (id) => {
  try {
    const result = await Tag.findByIdAndDelete(id);
    if (!result) throw new Error("Tag not found.");
    return { message: "Tag successfully deleted." };
  } catch (error) {
    throw new Error(`Could not delete tag: ${error.message}`);
  }
};

module.exports = {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
};
