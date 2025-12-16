# Ejemplos para Custom GPT Actions

Guía rápida para que un GPT entienda cómo mapear mensajes de usuario a los endpoints internos protegidos con `x-internal-secret`.

## Prompt → endpoint

1. **"Compré gasolina $55"** → `/api/wave/expenses/create`
2. **"Costco $128 toppings"** → `/api/wave/expenses/create` (o `/expenses/suggest` si se quiere confirmar la cuenta)
3. **"Home Depot $74 tools"** → `/api/wave/expenses/create`
4. **"Lista las cuentas de gasto del negocio"** → `/api/wave/accounts?types=EXPENSE`
5. **"Sugiere cuenta para comida de oficina $80"** → `/api/wave/expenses/suggest`

## Ejemplos de requests/responses

### 1) Crear gasto: gasolina
**Request**
```json
POST /api/wave/expenses/create
Headers: {"x-internal-secret":"${INTERNAL_API_SECRET}"}
Body: {
  "businessName": "Acme LLC",
  "date": "2024-05-20",
  "amount": 55,
  "description": "Gasolina",
  "vendor": "Shell",
  "categoryHint": "gasolina"
}
```
**Response**
```json
{
  "ok": true,
  "transactionId": "txn_123",
  "used": {
    "businessId": "biz_1",
    "anchorAccountId": "acc_cash",
    "expenseAccountId": "acc_fuel"
  },
  "wave": { "didSucceed": true }
}
```

### 2) Crear gasto: Costco toppings
**Request**
```json
POST /api/wave/expenses/create
Headers: {"x-internal-secret":"${INTERNAL_API_SECRET}"}
Body: {
  "businessName": "Acme LLC",
  "date": "2024-05-22",
  "amount": 128,
  "description": "Toppings para fiesta",
  "vendor": "Costco",
  "categoryHint": "alimentos"
}
```
**Response (si requiere elegir cuenta)**
```json
{
  "ok": false,
  "message": "Select expense account",
  "details": {
    "options": [
      {"accountId":"acc_supplies","name":"Supplies","type":"EXPENSE","score":0.8}
    ]
  }
}
```

### 3) Crear gasto: herramientas Home Depot
**Request**
```json
POST /api/wave/expenses/create
Headers: {"x-internal-secret":"${INTERNAL_API_SECRET}"}
Body: {
  "businessName": "Acme LLC",
  "date": "2024-05-23",
  "amount": 74,
  "description": "Herramientas básicas",
  "vendor": "Home Depot",
  "categoryHint": "herramientas"
}
```
**Response**
```json
{
  "ok": true,
  "transactionId": "txn_789",
  "used": {
    "businessId": "biz_1",
    "anchorAccountId": "acc_credit",
    "expenseAccountId": "acc_tools"
  },
  "wave": { "didSucceed": true }
}
```

### 4) Listar cuentas de gasto
**Request**
```json
GET /api/wave/accounts?types=EXPENSE&businessName=Acme%20LLC
Headers: {"x-internal-secret":"${INTERNAL_API_SECRET}"}
```
**Response**
```json
{
  "ok": true,
  "business": {"id":"biz_1","name":"Acme LLC","isActive":true},
  "accounts": [
    {"id":"acc_fuel","name":"Fuel","type":"EXPENSE","subtype":"FUEL"}
  ]
}
```

### 5) Sugerir cuenta para comida de oficina
**Request**
```json
POST /api/wave/expenses/suggest
Headers: {"x-internal-secret":"${INTERNAL_API_SECRET}"}
Body: {
  "businessName": "Acme LLC",
  "amount": 80,
  "text": "comida de oficina",
  "vendor": "Uber Eats",
  "categoryHint": "alimentos"
}
```
**Response**
```json
{
  "ok": true,
  "business": {"id":"biz_1","name":"Acme LLC","isActive":true},
  "suggestions": [
    {"accountId":"acc_meals","name":"Meals","type":"EXPENSE","score":2.5,"reason":"name matches alimentos"}
  ]
}
```

## Cómo el GPT debe decidir `businessName` y `categoryHint`
- **businessName**: llamar primero a `/api/wave/businesses` y, si solo hay un negocio activo, usarlo; si hay varios, pedir al usuario elegir por nombre.
- **categoryHint**: derivar del mensaje original usando palabras clave de vendor, descripción o categoría sugerida (ej. "gasolina", "comida", "herramientas"). Enviar el mismo valor en `text` para mejorar la coincidencia.

No incluyas ni envíes `WAVE_ACCESS_TOKEN` en las llamadas: el servidor lo maneja internamente. Solo envía `x-internal-secret`.
