export const requireORNumber = (req, res, next) => {
  if (!req.session.customerId) {
    return res.redirect("/customers/or-number");
  }
  next();
};
