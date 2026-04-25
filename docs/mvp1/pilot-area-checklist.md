# Checklist de arranque del area piloto

## 1. Preparacion del tenant

- [ ] nombre real de empresa cargado
- [ ] perfil de negocio correcto
- [ ] zona horaria definida
- [ ] horario operativo definido
- [ ] responsable principal definido
- [ ] email responsable definido
- [ ] token de Telegram configurado
- [ ] correo saliente configurado o documentado como pendiente
- [ ] instrucciones generales del asistente revisadas
- [ ] instrucciones operativas revisadas
- [ ] instrucciones de RRHH revisadas

## 2. Documentos base

- [ ] al menos 1 documento operativo
- [ ] al menos 1 documento de RRHH
- [ ] al menos 1 documento de empresa o politica
- [ ] documentos que alimentan IA marcados con `useForAi`

## 3. Empleados del area

Por cada empleado:

- [ ] `employeeCode`
- [ ] nombre completo
- [ ] rol principal correcto
- [ ] email o telefono si aplica
- [ ] estado `ACTIVE`
- [ ] PIN temporal generado
- [ ] procedimiento de entrega de PIN acordado

## 4. Roles a validar

- [ ] `admin` entra a `/settings`
- [ ] `manager` entra a `/manager`
- [ ] `rrhh` entra a `/rrhh`
- [ ] `manager` no entra a `/settings`
- [ ] usuarios operativos no acceden a datos de otros

## 5. Telegram

- [ ] webhook real apuntando al servidor
- [ ] login con PIN temporal probado
- [ ] cambio obligatorio de PIN probado
- [ ] revalidacion por cambio de cuenta probada
- [ ] texto natural probado
- [ ] audio probado
- [ ] foto como evidencia probada
- [ ] documento por Telegram probado
- [ ] recordatorio simple probado
- [ ] solicitud de nomina probada

## 6. Nominas

- [ ] al menos una nomina real o semirreal cargada
- [ ] validacion previa ejecutada
- [ ] bloqueos entendibles por empleado
- [ ] seleccion parcial probada
- [ ] seleccion total probada
- [ ] envio manual final probado

## 7. Operacion

- [ ] incidencia creada
- [ ] incidencia cerrada por manager o admin
- [ ] ruta iniciada
- [ ] ruta cerrada
- [ ] picking registrado
- [ ] carga registrada

## 8. Observacion inicial tras apertura

- [ ] logs de API vigilados
- [ ] errores de webhook vigilados
- [ ] errores de nomina vigilados
- [ ] incidencias abiertas revisadas
- [ ] feedback de manager y RRHH recogido
