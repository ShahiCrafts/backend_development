/**
 * Middleware to authorize users based on allowed roles.
 * @param {string[]} allowedRoles - Array of allowed roles (e.g. ['admin', 'official'])
 */
const roleAuthorization = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated.' });
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Access denied: insufficient permissions.' });
    }

    next();
  };
};

module.exports = { roleAuthorization };
