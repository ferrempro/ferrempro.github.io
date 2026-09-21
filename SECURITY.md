# Seguridad de RemPro Control

## Reporte responsable

Si detectas una vulnerabilidad, una credencial expuesta, acceso no autorizado o una forma de alterar datos de RemPro Control, no publiques detalles técnicos en un issue público.

Usa un reporte privado mediante **GitHub Security Advisories** del repositorio e incluye:

- componente afectado;
- pasos mínimos para reproducir el problema;
- impacto observado;
- evidencia suficiente sin incluir datos personales ni credenciales.

## Credenciales

Este repositorio sólo puede contener configuración pública para navegador, como la URL del proyecto y una clave publicable de Supabase.

Nunca deben versionarse:

- claves `service_role` o `sb_secret_*`;
- contraseñas de base de datos;
- JWT secrets;
- cadenas de conexión con usuario y contraseña;
- tokens personales de GitHub;
- llaves privadas, certificados o archivos `.env` con secretos.

## Datos

Los datos operativos y financieros de RemPro deben permanecer protegidos por autenticación, RLS y privilegios mínimos en Supabase. El repositorio público no debe contener respaldos reales, exportaciones JSON de producción ni documentos de clientes.
