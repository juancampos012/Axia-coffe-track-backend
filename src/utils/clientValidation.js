// Validación y serialización del modelo Client.
// Los mensajes se devuelven tal cual al frontend (se muestran en un alert).

const NAME_REGEX = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]{3,40}$/;
const PHONE_REGEX = /^\d{10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_DECIMAL_10_2 = 99999999.99;
const MAX_INT = 2147483647;

class ValidationError extends Error {}

const fail = (message) => { throw new ValidationError(message); };

const isBlank = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const today = () => new Date().toISOString().slice(0, 10);

// Texto opcional: undefined = no tocar, '' / null = limpiar
const parseOptionalText = (value, label, maxLength) => {
  if (value === undefined) return undefined;
  if (isBlank(value)) return null;
  if (typeof value !== 'string') fail(`${label} no es válido.`);
  const text = value.trim();
  if (maxLength && text.length > maxLength) fail(`${label} no puede superar ${maxLength} caracteres.`);
  return text;
};

const parseRequiredText = (value, label, maxLength) => {
  if (isBlank(value)) fail(`${label} es obligatorio.`);
  return parseOptionalText(value, label, maxLength);
};

const parseName = (value, label) => {
  const name = parseRequiredText(value, label);
  if (!NAME_REGEX.test(name)) fail(`${label} debe tener entre 3 y 40 letras.`);
  return name;
};

const parseBirthDate = (value) => {
  if (isBlank(value)) fail('La fecha de nacimiento es obligatoria.');
  // Acepta "YYYY-MM-DD" o un ISO completo; solo se usan los 10 primeros caracteres
  const text = String(value).trim().slice(0, 10);
  const match = DATE_REGEX.exec(text);
  if (!match) fail('La fecha de nacimiento no es válida (formato AAAA-MM-DD).');
  const date = new Date(`${text}T00:00:00.000Z`);
  // Descarta fechas como 2023-02-30 que Date "corrige" al mes siguiente
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    fail('La fecha de nacimiento no es válida.');
  }
  if (text > today()) fail('La fecha de nacimiento no puede ser futura.');
  if (Number(match[1]) < 1900) fail('La fecha de nacimiento no es válida.');
  return date;
};

const parsePositiveDecimal = (value, label) => {
  if (isBlank(value)) fail(`${label} es obligatorio.`);
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) fail(`${label} debe ser un número.`);
  const rounded = Math.round(number * 100) / 100;
  if (rounded <= 0) fail(`${label} debe ser mayor que 0.`);
  if (rounded > MAX_DECIMAL_10_2) fail(`${label} es demasiado grande.`);
  return rounded;
};

const parsePositiveInt = (value, label) => {
  if (isBlank(value)) fail(`${label} es obligatorio.`);
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number)) fail(`${label} debe ser un número entero.`);
  if (number <= 0) fail(`${label} debe ser mayor que 0.`);
  if (number > MAX_INT) fail(`${label} es demasiado grande.`);
  return number;
};

const parsePhone = (value) => {
  const phone = parseOptionalText(value, 'El teléfono');
  if (phone && !PHONE_REGEX.test(phone)) fail('El teléfono debe tener 10 dígitos.');
  return phone;
};

const parseEmail = (value) => {
  const email = parseOptionalText(value, 'El correo');
  if (email && !EMAIL_REGEX.test(email)) fail('El correo no es válido.');
  return email;
};

const checkCoffeeHectares = (coffee, total) => {
  if (coffee !== null && coffee !== undefined && total !== null && total !== undefined && Number(coffee) > Number(total)) {
    fail('Las hectáreas en café no pueden ser mayores que las hectáreas totales de la finca.');
  }
};

// POST /clients: los campos de finca y la fecha de nacimiento son obligatorios; el correo no
const validateCreateClient = (body = {}) => {
  const data = {
    identification: parseRequiredText(body.identification, 'La identificación'),
    firstName: parseName(body.firstName, 'El primer nombre'),
    middleName: parseOptionalText(body.middleName, 'El segundo nombre', 40),
    lastName: parseName(body.lastName, 'El primer apellido'),
    secondLastName: parseOptionalText(body.secondLastName, 'El segundo apellido', 40),
    phone: parsePhone(body.phone),
    email: parseEmail(body.email),
    birthDate: parseBirthDate(body.birthDate),
    farmName: parseRequiredText(body.farmName, 'El nombre de la finca', 80),
    farmVereda: parseRequiredText(body.farmVereda, 'La vereda de la finca', 80),
    farmTotalHectares: parsePositiveDecimal(body.farmTotalHectares, 'Las hectáreas totales'),
    farmCoffeeHectares: parsePositiveDecimal(body.farmCoffeeHectares, 'Las hectáreas en café'),
    coffeeTrees: parsePositiveInt(body.coffeeTrees, 'El número de árboles de café'),
  };
  checkCoffeeHectares(data.farmCoffeeHectares, data.farmTotalHectares);
  return data;
};

// PATCH /clients/:id: solo se validan y actualizan los campos presentes en el body.
// Los ausentes quedan undefined y Prisma no los toca (no se sobrescriben con null).
const validateUpdateClient = (body = {}, existing = {}) => {
  const has = (key) => body[key] !== undefined;
  const data = {
    identification: has('identification') ? parseRequiredText(body.identification, 'La identificación') : undefined,
    firstName: has('firstName') ? parseName(body.firstName, 'El primer nombre') : undefined,
    middleName: parseOptionalText(body.middleName, 'El segundo nombre', 40),
    lastName: has('lastName') ? parseName(body.lastName, 'El primer apellido') : undefined,
    secondLastName: parseOptionalText(body.secondLastName, 'El segundo apellido', 40),
    phone: parsePhone(body.phone),
    email: parseEmail(body.email),
    birthDate: has('birthDate') ? parseBirthDate(body.birthDate) : undefined,
    farmName: has('farmName') ? parseRequiredText(body.farmName, 'El nombre de la finca', 80) : undefined,
    farmVereda: has('farmVereda') ? parseRequiredText(body.farmVereda, 'La vereda de la finca', 80) : undefined,
    farmTotalHectares: has('farmTotalHectares') ? parsePositiveDecimal(body.farmTotalHectares, 'Las hectáreas totales') : undefined,
    farmCoffeeHectares: has('farmCoffeeHectares') ? parsePositiveDecimal(body.farmCoffeeHectares, 'Las hectáreas en café') : undefined,
    coffeeTrees: has('coffeeTrees') ? parsePositiveInt(body.coffeeTrees, 'El número de árboles de café') : undefined,
  };
  // Si solo llega uno de los dos, se compara contra el valor guardado
  checkCoffeeHectares(
    data.farmCoffeeHectares !== undefined ? data.farmCoffeeHectares : existing.farmCoffeeHectares,
    data.farmTotalHectares !== undefined ? data.farmTotalHectares : existing.farmTotalHectares,
  );
  return data;
};

// Prisma devuelve DECIMAL como Decimal (se serializa como string) y DATE como Date con hora.
// Se normalizan para que el JSON lleve number y "YYYY-MM-DD".
const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

const serializeClient = (client) => {
  if (!client) return client;
  const result = { ...client };
  if ('birthDate' in client) result.birthDate = client.birthDate ? client.birthDate.toISOString().slice(0, 10) : null;
  if ('farmTotalHectares' in client) result.farmTotalHectares = toNumberOrNull(client.farmTotalHectares);
  if ('farmCoffeeHectares' in client) result.farmCoffeeHectares = toNumberOrNull(client.farmCoffeeHectares);
  return result;
};

module.exports = { ValidationError, validateCreateClient, validateUpdateClient, serializeClient };
