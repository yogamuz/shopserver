// utils/filterUserData.js

/**
 * Filter sensitive user data for API responses
 * @param {Object} user - User object from database
 * @param {boolean} includeEmail - Whether to include email (for admin or user's own data)
 * @returns {Object} Filtered user data
 */
const filterUserData = (user, includeEmail = false) => {
  if (!user) {
    return null;
  }

  const filtered = {
    id: user._id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };

  // Email only for admin or user's own data
  if (includeEmail) {
    filtered.email = user.email;
  }

  // Include updatedAt if it exists
  if (user.updatedAt) {
    filtered.updatedAt = user.updatedAt;
  }

  // Include deletedAt if it exists (for soft deleted users)
  if (user.deletedAt) {
    filtered.deletedAt = user.deletedAt;
  }

  return filtered;
};

/**
 * Filter array of users
 * @param {Array} users - Array of user objects
 * @param {boolean} includeEmail - Whether to include email
 * @returns {Array} Array of filtered user data
 */
const filterUsersArray = (users, includeEmail = false) => {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map(user => filterUserData(user, includeEmail));
};

module.exports = {
  filterUserData,
  filterUsersArray
};