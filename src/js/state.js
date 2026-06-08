// ── Shared application state ──
// All modules import { state } from '../state.js' and use state.X
// Mutation via state.X = value — no getters/setters needed.

const NOW = new Date();

export const state = {
  currentMonth: NOW.getMonth(),
  currentYear:  NOW.getFullYear(),
  sections:     [],
  incomes:      [],
  nextId:       9000,
  incomeNextId: 100,
  yearGoals:    {},  // { [monthIndex]: { [sectionId]: limitValue } }
  saveTimer:    null,
  userId:       null, // cached after login — avoids repeated getUser() calls
};
