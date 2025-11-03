import bcrypt from "bcrypt";

const password = "cashier#123";
const salt = await bcrypt.genSalt(10);
const hash = await bcrypt.hash(password, salt);
console.log(hash);
