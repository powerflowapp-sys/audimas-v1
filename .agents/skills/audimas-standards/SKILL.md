---
name: audimas-standards
description: Estándares arquitectónicos, esquema de Supabase, reglas de negocio de auditoría y comandos de despliegue para la suite AudiMAS V1. Úsalo siempre al modificar UI, base de datos o lógica operativa.
---

# Estándares Arquitectónicos y Directivas Obligatorias de AudiMAS V1

Este Agent Skill define las reglas de negocio, esquema de base de datos, estándares de UI/UX y flujo obligatorio de compilación/despliegue para la suite **AudiMAS V1**. Debe seguirse rigurosamente al realizar cualquier modificación en la base de datos, interfaz de usuario o lógica operativa.

---

## 1. Esquema y Base de Datos (Supabase)

### Tabla `profiles`
- **Nombre del Colaborador**: La columna que almacena el nombre del colaborador es estrictamente `full_name` (**NO** existe la columna `nombre_apellido`).
- **Unicidad**: Cada colaborador debe poseer un `full_name` único (insensible a mayúsculas/minúsculas).
- **Eliminación de usuarios**: Al borrar un perfil en `profiles`, un trigger de PostgreSQL elimina automáticamente la cuenta correspondiente en `auth.users`.

### Almacenamiento de Avatares
- **Bucket Público**: `avatars`.
- **Avatares Predefinidos**: Los 12 avatares SVG predefinidos se guardan directamente como strings SVG / rutas locales.
- **Fotos de Cámara y Galería**: Se suben como `.jpg` / `.png` a `avatars/{userId}/...` y se guarda su URL pública en `profiles.avatar_url`.

### Entrega Obligatoria de Scripts SQL (Supabase)
- **ENTREGA OBLIGATORIA DE SCRIPTS SQL (SUPABASE)**: Cada vez que se desarrolle, modifique o sugiera una funcionalidad que involucre nuevas columnas, tablas, tipos ENUM, restricciones CHECK, funciones RPC, políticas RLS o triggers en la base de datos, el agente DEBE entregar explícitamente en su reporte final el bloque de código SQL listo para copiar y ejecutar en el SQL Editor de Supabase. Nunca se debe asumir que el esquema remoto ya cuenta con dichas modificaciones sin haber provisto el script.

---

## 2. Reglas de Negocio Operativas

### Persistencia de Auditor
- El nombre del colaborador activo proviene de `localStorage.getItem('audimas_collaborator')`.
- Se estampa obligatoriamente en:
  - `usuario_inicio_auditoria`
  - `usuario_fin_auditoria`
  - `usuario_escaneo`
  - `auditoria_logs`

### Módulo Magma (Reclamos)
- **Cero Discrepancias**: Si un camión finaliza con 0 discrepancias (0 faltantes, 0 sobrantes, 0 roturas y 0 sin contar), **NUNCA** debe generar un reclamo en Magma.

### Auditoría Parcial
- La acción 'Finalizar Parcial' excluye del balance de diferencias e impacto de Magma a todos los productos sin conteo ni rotura, procesando solo los ítems escaneados.

---

## 3. Estándares de UI / UX

### Estilo Visual
- **Tema**: Dark Mode nativo.
- **CSS**: Tailwind CSS.
- **Componentes**: Tarjetas con `backdrop-blur` y bordes sutiles.

### Modales y Diálogos
- **Prohibición**: Prohibido usar `window.confirm()` o `alert()` nativos.
- **Implementación**: Utilizar siempre modales flotantes integrados en la UI.

### Vista de Login
- El botón **"ACCESO SUPERADMIN"** debe mantenerse flotante en la esquina superior derecha (`md:fixed md:top-4 md:right-4`) en pantallas desktop.

---

## 4. Flujo Obligatorio de Compilación y Deploy

Antes de confirmar cualquier cambio, ejecutar y verificar:

1. **Chequeo de Tipos**:
   ```bash
   npx tsc --noEmit
   ```
   *(Cero errores de tipado)*

2. **Generación de Bundle**:
   ```bash
   npx vite build
   ```
   *(Generación limpia de bundle)*

3. **Sincronización Git & GitHub**:
   ```bash
   git add . && git commit -m "..." && git push origin main
   ```
   *(Subida de cambios al repositorio remoto)*

4. **Despliegue a Producción**:
   ```bash
   npx vercel --prod --yes
   ```
   *(Despliegue automatizado a producción en Vercel)*
