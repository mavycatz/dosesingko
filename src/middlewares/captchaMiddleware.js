export const captchaMiddleware = (req, res, next) => {
  if (req.hostname === "localhost") {
    const num1 = Math.floor(Math.random() * 10);
    const num2 = Math.floor(Math.random() * 10);
    req.session.captchaAnswer = num1 + num2;
    res.locals.captcha = { question: `${num1} + ${num2}` };
  } else {
    res.locals.captcha = { question: "Disabled in production" };
  }
  next();
};
