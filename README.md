# Podio de Filipinos

Cata a ciegas de seis cajas de filipinos de chocolate blanco. Cada persona ordena las cajas en un podio de seis puestos arrastrándolas con el dedo, apunta cómo sabía cada una y, al final, se ven los votos de todos y un ranking por media y moda.

No hace falta registrarse: **el móvil del anfitrión es la sala** y los demás se conectan a él directamente.

## Cómo se usa

**Vilaboa (anfitrión)**

1. Abre la web y pulsa **Crear sala**.
2. Comparte el enlace o enseña el código QR. Desde la barra de abajo («Toca para invitar o ver quién») se puede volver a sacar en cualquier momento.
3. Cuando estén todos dentro, pulsa **Abrir sala**. Vilaboa también vota, como uno más.
4. **Pasar a resultados** enseña el podio del grupo, el ranking por media y moda y qué votó cada uno. Si falta alguien por votar, primero avisa de quién.
5. **Nueva sala** empieza otra ronda con el podio vacío (los votos de la anterior se quedan guardados). **Liberar** suelta el nombre de alguien que se equivocó.

Mientras dure la cata, deja la página abierta y la pantalla encendida en el móvil del anfitrión (la página pide al móvil que no apague la pantalla cuando el navegador lo permite).

**Invitados**

1. Abren el enlace, eligen su nombre (Skipy, Adrian, Saul, Diana, Raquel o Juan).
2. Arrastran cada caja a su puesto (o tocan una caja y luego un puesto), escriben sus notas y pulsan **Enviar voto**. Pueden cambiarlo hasta que se pase a resultados.

Las notas son privadas: se guardan solo en el móvil de cada uno y no se envían a nadie.

## Qué pasa si algo falla

Todo se reconecta solo. Un supervisor revisa la conexión cada segundo y la rehace con esperas crecientes; además, los móviles se mandan un latido cada 4 segundos para detectar conexiones muertas que no avisan.

| Fallo | Qué ocurre |
| --- | --- |
| Un invitado recarga, bloquea el móvil o pierde cobertura | Al volver se reconecta solo, con su nombre, su podio y sus notas. |
| El anfitrión recarga la página | La sala está guardada en su móvil; se reabre y los invitados vuelven solos en uno o dos segundos. |
| El móvil del anfitrión se bloquea o cambia de app | Los invitados ven «Reconectando» y siguen intentándolo; al volver el anfitrión, entran solos (puede tardar hasta un minuto si el móvil cortó la conexión de golpe). |
| Alguien vota sin conexión | El voto queda guardado en su móvil y se envía solo al reconectar, aunque recargue la página. |
| Se cae el servidor de enlace | Los que ya están conectados siguen votando; los nuevos entran cuando vuelve. |
| Alguien abre el enlace en otro navegador (p. ej. fuera de WhatsApp) | Su nombre aparece como «Sin conexión. ¿Eres tú?» y puede recuperarlo con su voto (las notas se quedan en el navegador anterior). |

## Límites

- La sala vive en el móvil del anfitrión: si se borran los datos del navegador, se pierde.
- Para que los móviles se encuentren se usa el servidor gratuito de [PeerJS](https://peerjs.com/). Si ese servicio estuviera caído, no se podría entrar en la sala. Con datos móviles, algunas redes necesitan el servidor de retransmisión gratuito de PeerJS, que también viene configurado.

## Desarrollo

Web estática sin compilación (GitHub Pages):

```
index.html
css/styles.css
js/logic.js    media, moda, ranking y reglas del podio (sin dependencias)
js/board.js    podio y arrastre con el dedo
js/net.js      conexión entre móviles y reconexión
js/app.js      estado de la sala, anfitrión e invitados
js/views.js    pantallas y eventos
vendor/        PeerJS 1.5.4 y qrcode-generator 1.4.4 (licencia MIT)
test/          pruebas
```

Pruebas: `cd test && npm install && npm test`. La prueba de extremo a extremo levanta un servidor PeerJS local y varios navegadores con conexiones WebRTC reales, y provoca recargas, cortes del servidor, un anfitrión que deja de responder y votos sin conexión.
