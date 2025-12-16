# Wave Expense AI Backend

Backend listo para Vercel que permite a un Custom GPT registrar gastos en Wave sin IDs manuales usando solo `WAVE_ACCESS_TOKEN` en el servidor.

## Requisitos de entorno
- `INTERNAL_API_SECRET`: secreto para `x-internal-secret` requerido en todos los endpoints.
- `WAVE_ACCESS_TOKEN`: token de Wave usado únicamente server-side.

## Ejecutar localmente
```bash
npm install
npm run dev
```

## Smoke test local
Con el servidor corriendo en `http://localhost:3000` y tus variables de entorno configuradas:

```bash
INTERNAL_API_SECRET=your-secret WAVE_ACCESS_TOKEN=your-wave-token npm run smoke
```

## Despliegue en Vercel
- Añade las variables de entorno anteriores en el dashboard de Vercel.
- Deploy directo al conectar el repo; usa Next.js App Router.

## Endpoints principales
- `GET /api/health`
- `GET /api/wave/businesses`
- `GET /api/wave/accounts` (filtros `businessId|businessName`, `types`, `query`)
- `POST /api/wave/expenses/suggest`
- `POST /api/wave/expenses/create`
- `POST /api/wave/customers/find-or-create`
- `POST /api/wave/products/find-or-create`

Todas las rutas requieren header `x-internal-secret` con `INTERNAL_API_SECRET`.

## OpenAPI para Custom GPT
El archivo `openapi.yaml` define los endpoints anteriores con seguridad `apiKey` en header `x-internal-secret`. Carga este archivo en la configuración de Actions del GPT y define la variable `x-internal-secret` con tu secreto interno.

## Ejemplos rápidos
### Listar negocios
```bash
curl -H "x-internal-secret: $INTERNAL_API_SECRET" https://<vercel>/api/wave/businesses
```

### Crear gasto automático
```bash
curl -X POST \
  -H "x-internal-secret: $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"date":"2024-06-01","amount":25.5,"description":"Snacks office"}' \
  https://<vercel>/api/wave/expenses/create
```

## Postman
`postman/collection.json` incluye ejemplos para health, negocios, cuentas, sugerir gasto y crear gasto (auto o con cuentas manuales), y utilidades para clientes/productos. Define variables `base_url` y `internal_secret`.
