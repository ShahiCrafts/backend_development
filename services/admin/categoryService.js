const Category = require("../../models/categoryModel");

const getAllCategories = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      isActive,
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

    const [categories, total] = await Promise.all([
      Category.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Category.countDocuments(query).exec(),
    ]);

    return { categories, total, page: Number(page), limit: Number(limit) };
  } catch (error) {
    throw new Error(`Could not fetch categories: ${error.message}`);
  }
};

const getCategoryById = async (id) => {
  try {
    const category = await Category.findById(id).lean().exec();
    if (!category) throw new Error("Category not found.");
    return category;
  } catch (error) {
    throw new Error(`Could not fetch category: ${error.message}`);
  }
};

const createCategory = async (categoryData) => {
  try {
    const category = new Category(categoryData);
    return await category.save();
  } catch (error) {
    throw new Error(`Could not create category: ${error.message}`);
  }
};

const updateCategory = async (id, updateData) => {
  try {
    const category = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!category) throw new Error("Category not found.");
    return category;
  } catch (error) {
    throw new Error(`Could not update category: ${error.message}`);
  }
};

const deleteCategory = async (id) => {
  try {
    const result = await Category.findByIdAndDelete(id);
    if (!result) throw new Error("Category not found.");
    return { message: "Category successfully deleted." };
  } catch (error) {
    throw new Error(`Could not delete category: ${error.message}`);
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
