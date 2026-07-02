import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { addExpense, getGroupExpenses, deleteExpense } from "../controllers/expenseController.js";

const router = express.Router();

router.post("/", verifyToken, addExpense);
router.get("/group/:groupId", verifyToken, getGroupExpenses);
router.delete("/:expenseId", verifyToken, deleteExpense);

export default router;