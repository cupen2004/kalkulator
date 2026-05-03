const displayEl = document.getElementById("display");
const expressionEl = document.getElementById("expression");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyToggle = document.getElementById("historyToggle");
const clearHistoryButton = document.getElementById("clearHistory");
const scienceToggle = document.getElementById("scienceToggle");
const scientificPanel = document.getElementById("scientificPanel");
const phoneFrame = document.querySelector(".phone-frame");

const binaryOperators = new Set(["+", "-", "*", "/", "^", "root", "EE"]);
const postfixOperators = new Set(["%", "!", "sq", "cube", "recip"]);
const functionTokens = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
  "ln",
  "log10",
  "exp",
  "exp10",
  "sqrt",
  "cbrt",
  "neg",
]);

const state = {
  tokens: [],
  displayValue: "0",
  lastAnswer: 0,
  expressionOverride: "",
  memory: 0,
  second: false,
  radian: true,
  scientificManual: false,
  justEvaluated: false,
  history: [],
};

const scientificButtons = Array.from(scientificPanel.querySelectorAll("[data-action]"));
const operatorButtons = Array.from(document.querySelectorAll(".key-operator"));

function isNumberToken(token) {
  return typeof token === "string" && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token);
}

function isValueLike(token) {
  return isNumberToken(token) || token === ")" || postfixOperators.has(token);
}

function localeNumberText(value) {
  return value.replace(".", ",");
}

function trimNumberString(value) {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/\.?0+$/, "");
}

function formatResult(value) {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  const absValue = Math.abs(value);
  if ((absValue >= 1e12 || (absValue > 0 && absValue < 1e-9))) {
    return value.toExponential(6).replace(".", ",").replace("e+", "e");
  }

  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 12,
  }).format(value);

  return formatted;
}

function tokenToText(token) {
  const tokenMap = {
    "*": "×",
    "/": "÷",
    "^": "^",
    root: "ʸ√x",
    EE: "EE",
    sq: "²",
    cube: "³",
    recip: "⁻¹",
    "%": "%",
    "!": "!",
    exp: "eˣ",
    exp10: "10ˣ",
    sqrt: "√",
    cbrt: "∛",
    ln: "ln",
    log10: "log",
    neg: "-",
  };

  if (isNumberToken(token)) {
    return localeNumberText(trimNumberString(token));
  }

  return tokenMap[token] ?? token;
}

function renderExpression() {
  expressionEl.textContent = state.expressionOverride || state.tokens.map(tokenToText).join(" ");
}

function setDisplayFromTokens() {
  const range = getLastOperandRange();

  if (!range) {
    state.displayValue = state.justEvaluated ? formatResult(state.lastAnswer) : "0";
    return;
  }

  if (isNumberToken(state.tokens[range.end])) {
    state.displayValue = localeNumberText(trimNumberString(state.tokens[range.end]));
    return;
  }

  state.displayValue = getPreviewValue();
}

function getPreviewValue() {
  try {
    const preview = evaluateTokens(closeUnmatchedParentheses(state.tokens));
    return formatResult(preview);
  } catch {
    return state.displayValue;
  }
}

function render() {
  renderExpression();
  displayEl.textContent = state.displayValue;
  document.querySelector('[data-action="toggle-angle"]').textContent = state.radian ? "Rad" : "Deg";
  document.querySelector('[data-action="toggle-angle"]').classList.toggle("active-angle", state.radian);
  document.querySelector('[data-action="toggle-second"]').classList.toggle("active-secondary", state.second);
  operatorButtons.forEach((button) => button.classList.remove("active"));

  if (historyPanel.classList.contains("open")) {
    renderHistory();
  }
}

function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = '<p class="history-empty">Belum ada perhitungan.</p>';
    return;
  }

  historyList.innerHTML = state.history
    .map(
      (item) => `
        <article class="history-item">
          <p class="history-expression">${item.expression}</p>
          <p class="history-result">${item.result}</p>
        </article>
      `,
    )
    .join("");
}

function ensureManualScientificState() {
  phoneFrame.classList.toggle("scientific-active", state.scientificManual);
}

function refreshAutomaticScientificMode() {
  phoneFrame.classList.remove("auto-scientific");
  ensureManualScientificState();
}

function pushImplicitMultiplyIfNeeded() {
  const last = state.tokens.at(-1);
  if (isValueLike(last)) {
    state.tokens.push("*");
  }
}

function beginEditing(clearTokens = false) {
  if (clearTokens) {
    state.tokens = [];
  }
  state.justEvaluated = false;
  state.expressionOverride = "";
}

function appendNumber(digit) {
  if (state.justEvaluated) {
    beginEditing(true);
  }

  const last = state.tokens.at(-1);
  if (isNumberToken(last)) {
    state.tokens[state.tokens.length - 1] =
      last === "0" ? digit
      : last === "-0" ? `-${digit}`
      : `${last}${digit}`;
  } else if (last === ")" || postfixOperators.has(last)) {
    state.tokens.push("*", digit);
  } else {
    state.tokens.push(digit);
  }

  setDisplayFromTokens();
  render();
}

function appendDecimal() {
  if (state.justEvaluated) {
    beginEditing(true);
  }

  const last = state.tokens.at(-1);
  if (isNumberToken(last) && !last.includes(".")) {
    state.tokens[state.tokens.length - 1] = `${last}.`;
  } else if (!isNumberToken(last)) {
    if (last === ")" || postfixOperators.has(last)) {
      state.tokens.push("*");
    }
    state.tokens.push("0.");
  }

  setDisplayFromTokens();
  render();
}

function appendOperator(operator) {
  if (!state.tokens.length && operator !== "-") {
    return;
  }

  if (!state.tokens.length && operator === "-") {
    state.tokens.push("-0");
    state.displayValue = "-0";
    state.expressionOverride = "";
    render();
    return;
  }

  if (state.justEvaluated) {
    beginEditing(false);
  }

  const last = state.tokens.at(-1);
  if (binaryOperators.has(last)) {
    state.tokens[state.tokens.length - 1] = operator;
  } else if (last === "(" && operator === "-") {
    state.tokens.push("0", "-");
  } else if (isValueLike(last) || last === ")") {
    state.tokens.push(operator);
  }

  state.displayValue = "0";
  render();
}

function appendConstant(value) {
  if (state.justEvaluated) {
    beginEditing(true);
  }

  pushImplicitMultiplyIfNeeded();
  state.tokens.push(String(value));
  setDisplayFromTokens();
  render();
}

function appendRandom() {
  appendConstant(Number(Math.random().toFixed(8)));
}

function openParen() {
  if (state.justEvaluated) {
    beginEditing(true);
  }

  pushImplicitMultiplyIfNeeded();
  state.tokens.push("(");
  render();
}

function closeParen() {
  if (state.justEvaluated) {
    beginEditing(false);
  }

  const balance = getOpenParenBalance();
  const last = state.tokens.at(-1);
  if (balance > 0 && (isValueLike(last) || last === ")")) {
    state.tokens.push(")");
    setDisplayFromTokens();
    render();
  }
}

function getOpenParenBalance() {
  return state.tokens.reduce((count, token) => {
    if (token === "(") return count + 1;
    if (token === ")") return count - 1;
    return count;
  }, 0);
}

function closeUnmatchedParentheses(tokens) {
  const closed = [...tokens];
  const balance = closed.reduce((count, token) => {
    if (token === "(") return count + 1;
    if (token === ")") return count - 1;
    return count;
  }, 0);

  for (let index = 0; index < balance; index += 1) {
    closed.push(")");
  }

  return closed;
}

function getLastOperandRange() {
  if (!state.tokens.length) {
    return null;
  }

  const fullEnd = state.tokens.length - 1;
  let end = fullEnd;

  while (end >= 0 && postfixOperators.has(state.tokens[end])) {
    end -= 1;
  }

  if (end < 0) {
    return null;
  }

  if (isNumberToken(state.tokens[end])) {
    return { start: end, end: fullEnd };
  }

  if (state.tokens[end] === ")") {
    let depth = 1;
    let start = end - 1;

    while (start >= 0) {
      if (state.tokens[start] === ")") depth += 1;
      if (state.tokens[start] === "(") depth -= 1;
      if (depth === 0) break;
      start -= 1;
    }

    if (start < 0) {
      return null;
    }

    if (start > 0 && functionTokens.has(state.tokens[start - 1])) {
      start -= 1;
    }

    return { start, end: fullEnd };
  }

  return null;
}

function wrapLastOperand(functionName) {
  if (state.justEvaluated) {
    beginEditing(false);
  }

  const range = getLastOperandRange();
  if (!range) {
    state.tokens.push(functionName, "(");
    render();
    return;
  }

  const operandTokens = state.tokens.slice(range.start, range.end + 1);
  state.tokens.splice(range.start, range.end - range.start + 1, functionName, "(", ...operandTokens, ")");
  setDisplayFromTokens();
  render();
}

function appendPostfix(postfix) {
  if (state.justEvaluated) {
    beginEditing(false);
  }

  const range = getLastOperandRange();
  if (!range) {
    return;
  }

  state.tokens.push(postfix);
  setDisplayFromTokens();
  render();
}

function toggleSign() {
  if (state.justEvaluated) {
    beginEditing(false);
  }

  const range = getLastOperandRange();
  if (!range) {
    state.tokens.push("-0");
    setDisplayFromTokens();
    render();
    return;
  }

  if (range.start === range.end && isNumberToken(state.tokens[range.start])) {
    const value = Number(state.tokens[range.start]) * -1;
    state.tokens[range.start] = trimNumberString(String(value));
  } else {
    const operandTokens = state.tokens.slice(range.start, range.end + 1);
    state.tokens.splice(range.start, range.end - range.start + 1, "neg", "(", ...operandTokens, ")");
  }

  setDisplayFromTokens();
  render();
}

function backspace() {
  if (state.justEvaluated) {
    state.tokens = [];
    state.displayValue = "0";
    state.justEvaluated = false;
    state.expressionOverride = "";
    render();
    return;
  }

  const last = state.tokens.at(-1);
  if (isNumberToken(last)) {
    const shortened = last.slice(0, -1);
    if (shortened && shortened !== "-" && shortened !== "-0") {
      state.tokens[state.tokens.length - 1] = shortened;
    } else {
      state.tokens.pop();
    }
  } else {
    state.tokens.pop();
  }

  if (!state.tokens.length) {
    state.displayValue = "0";
  } else {
    setDisplayFromTokens();
  }
  render();
}

function clearAll() {
  state.tokens = [];
  state.displayValue = "0";
  state.expressionOverride = "";
  state.justEvaluated = false;
  render();
}

function applySecondState() {
  scientificButtons.forEach((button) => {
    const baseAction = button.dataset.action;
    const altAction = button.dataset.altAction;
    const altLabel = button.dataset.altLabel;

    if (!altAction || !altLabel) {
      return;
    }

    if (state.second) {
      button.dataset.currentAction = altAction;
      button.textContent = altLabel;
    } else {
      button.dataset.currentAction = baseAction;
      button.textContent = button.dataset.label ?? button.textContent;
    }
  });
}

function toggleSecond() {
  state.second = !state.second;
  applySecondState();
  render();
}

function toggleAngleMode() {
  state.radian = !state.radian;
  render();
}

function clearHistory() {
  state.history = [];
  renderHistory();
}

function toggleHistory() {
  historyPanel.classList.toggle("open");
  render();
}

function toggleScientificManually() {
  state.scientificManual = !state.scientificManual;
  ensureManualScientificState();
}

function memoryClear() {
  state.memory = 0;
}

function currentDisplayNumber() {
  return Number(state.displayValue.replace(/\./g, "").replace(",", "."));
}

function memoryAdd() {
  state.memory += currentDisplayNumber();
}

function memorySubtract() {
  state.memory -= currentDisplayNumber();
}

function memoryRecall() {
  appendConstant(state.memory);
}

function toRadians(value) {
  return state.radian ? value : (value * Math.PI) / 180;
}

function fromRadians(value) {
  return state.radian ? value : (value * 180) / Math.PI;
}

function factorial(value) {
  if (value < 0 || !Number.isInteger(value)) {
    throw new Error("Factorial hanya untuk bilangan bulat non-negatif.");
  }

  let result = 1;
  for (let count = 2; count <= value; count += 1) {
    result *= count;
  }
  return result;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, EE: 3, "^": 4, root: 4 };
  const rightAssociative = new Set(["^", "root", "EE"]);

  for (const token of tokens) {
    if (isNumberToken(token)) {
      output.push(token);
      continue;
    }

    if (postfixOperators.has(token)) {
      output.push(token);
      continue;
    }

    if (functionTokens.has(token)) {
      stack.push(token);
      continue;
    }

    if (binaryOperators.has(token)) {
      while (stack.length) {
        const top = stack.at(-1);
        if (!binaryOperators.has(top)) {
          break;
        }

        const higher =
          rightAssociative.has(token)
            ? precedence[token] < precedence[top]
            : precedence[token] <= precedence[top];

        if (!higher) {
          break;
        }

        output.push(stack.pop());
      }

      stack.push(token);
      continue;
    }

    if (token === "(") {
      stack.push(token);
      continue;
    }

    if (token === ")") {
      while (stack.length && stack.at(-1) !== "(") {
        output.push(stack.pop());
      }

      stack.pop();

      if (functionTokens.has(stack.at(-1))) {
        output.push(stack.pop());
      }
    }
  }

  while (stack.length) {
    output.push(stack.pop());
  }

  return output;
}

function evaluateRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (isNumberToken(token)) {
      stack.push(Number(token));
      continue;
    }

    if (postfixOperators.has(token)) {
      const value = stack.pop();
      if (value === undefined) {
        throw new Error("Ekspresi tidak lengkap.");
      }

      const nextValue =
        token === "%" ? value / 100
        : token === "!" ? factorial(value)
        : token === "sq" ? value ** 2
        : token === "cube" ? value ** 3
        : 1 / value;

      stack.push(nextValue);
      continue;
    }

    if (binaryOperators.has(token)) {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) {
        throw new Error("Ekspresi tidak lengkap.");
      }

      const nextValue =
        token === "+" ? left + right
        : token === "-" ? left - right
        : token === "*" ? left * right
        : token === "/" ? left / right
        : token === "^" ? left ** right
        : token === "EE" ? left * 10 ** right
        : right ** (1 / left);

      stack.push(nextValue);
      continue;
    }

    if (functionTokens.has(token)) {
      const value = stack.pop();
      if (value === undefined) {
        throw new Error("Fungsi butuh angka.");
      }

      const nextValue =
        token === "sin" ? Math.sin(toRadians(value))
        : token === "cos" ? Math.cos(toRadians(value))
        : token === "tan" ? Math.tan(toRadians(value))
        : token === "asin" ? fromRadians(Math.asin(value))
        : token === "acos" ? fromRadians(Math.acos(value))
        : token === "atan" ? fromRadians(Math.atan(value))
        : token === "sinh" ? Math.sinh(value)
        : token === "cosh" ? Math.cosh(value)
        : token === "tanh" ? Math.tanh(value)
        : token === "asinh" ? Math.asinh(value)
        : token === "acosh" ? Math.acosh(value)
        : token === "atanh" ? Math.atanh(value)
        : token === "ln" ? Math.log(value)
        : token === "log10" ? Math.log10(value)
        : token === "exp" ? Math.exp(value)
        : token === "exp10" ? 10 ** value
        : token === "sqrt" ? Math.sqrt(value)
        : token === "cbrt" ? Math.cbrt(value)
        : value * -1;

      stack.push(nextValue);
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error("Perhitungan tidak valid.");
  }

  return stack[0];
}

function evaluateTokens(tokens) {
  return evaluateRpn(toRpn(tokens));
}

function evaluateExpression() {
  if (!state.tokens.length) {
    return;
  }

  try {
    const closedTokens = closeUnmatchedParentheses(state.tokens);
    const result = evaluateTokens(closedTokens);
    const expression = closedTokens.map(tokenToText).join(" ");
    const formatted = formatResult(result);

    state.history.unshift({ expression, result: formatted });
    state.history = state.history.slice(0, 8);
    state.tokens = [String(result)];
    state.displayValue = formatted;
    state.lastAnswer = result;
    state.expressionOverride = `${expression} =`;
    state.justEvaluated = true;
    render();
  } catch {
    state.displayValue = "Error";
    render();
  }
}

function handleAction(action) {
  switch (action) {
    case "clear":
      clearAll();
      break;
    case "decimal":
      appendDecimal();
      break;
    case "add":
      appendOperator("+");
      break;
    case "subtract":
      appendOperator("-");
      break;
    case "multiply":
      appendOperator("*");
      break;
    case "divide":
      appendOperator("/");
      break;
    case "equals":
      evaluateExpression();
      break;
    case "backspace":
      backspace();
      break;
    case "percent":
      appendPostfix("%");
      break;
    case "toggle-sign":
      toggleSign();
      break;
    case "toggle-second":
      toggleSecond();
      break;
    case "toggle-angle":
      toggleAngleMode();
      break;
    case "open-paren":
      openParen();
      break;
    case "close-paren":
      closeParen();
      break;
    case "memory-clear":
      memoryClear();
      break;
    case "memory-add":
      memoryAdd();
      break;
    case "memory-subtract":
      memorySubtract();
      break;
    case "memory-recall":
      memoryRecall();
      break;
    case "square":
      appendPostfix("sq");
      break;
    case "cube":
      appendPostfix("cube");
      break;
    case "power":
      appendOperator("^");
      break;
    case "root":
      appendOperator("root");
      break;
    case "reciprocal":
      appendPostfix("recip");
      break;
    case "sqrt":
      wrapLastOperand("sqrt");
      break;
    case "cbrt":
      wrapLastOperand("cbrt");
      break;
    case "ln":
      wrapLastOperand("ln");
      break;
    case "log10":
      wrapLastOperand("log10");
      break;
    case "factorial":
      appendPostfix("!");
      break;
    case "exp":
      wrapLastOperand("exp");
      break;
    case "exp10":
      wrapLastOperand("exp10");
      break;
    case "sin":
    case "cos":
    case "tan":
    case "asin":
    case "acos":
    case "atan":
    case "sinh":
    case "cosh":
    case "tanh":
    case "asinh":
    case "acosh":
    case "atanh":
      wrapLastOperand(action);
      break;
    case "constant-pi":
      appendConstant(Math.PI);
      break;
    case "constant-e":
      appendConstant(Math.E);
      break;
    case "rand":
      appendRandom();
      break;
    case "ee":
      appendOperator("EE");
      break;
    default:
      break;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.number) {
    appendNumber(button.dataset.number);
    return;
  }

  if (button.dataset.action) {
    const action = button.dataset.currentAction || button.dataset.action;
    handleAction(action);
  }
});

window.addEventListener("keydown", (event) => {
  let handled = false;

  if (/\d/.test(event.key)) {
    appendNumber(event.key);
    handled = true;
  }

  if (event.key === ",") {
    appendDecimal();
    handled = true;
  }

  if (event.key === ".") {
    appendDecimal();
    handled = true;
  }

  if (event.key === "+") {
    appendOperator("+");
    handled = true;
  }
  if (event.key === "-") {
    appendOperator("-");
    handled = true;
  }
  if (event.key === "*") {
    appendOperator("*");
    handled = true;
  }
  if (event.key === "/") {
    appendOperator("/");
    handled = true;
  }
  if (event.key === "%") {
    appendPostfix("%");
    handled = true;
  }
  if (event.key === "(") {
    openParen();
    handled = true;
  }
  if (event.key === ")") {
    closeParen();
    handled = true;
  }
  if (event.key === "Enter" || event.key === "=") {
    evaluateExpression();
    handled = true;
  }
  if (event.key === "Backspace") {
    backspace();
    handled = true;
  }
  if (event.key === "Escape") {
    clearAll();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
});

historyToggle.addEventListener("click", toggleHistory);
clearHistoryButton.addEventListener("click", clearHistory);
scienceToggle.addEventListener("click", toggleScientificManually);
window.addEventListener("resize", refreshAutomaticScientificMode);

scientificButtons.forEach((button) => {
  if (!button.dataset.label) {
    button.dataset.label = button.textContent;
  }
  button.dataset.currentAction = button.dataset.action;
});

applySecondState();
refreshAutomaticScientificMode();
render();
