// Utilidad muy simple para pares bilingües mostrados una debajo de la otra.
// En web queremos mostrar ambos idiomas simultáneamente (español principal + inglés en itálica).

export const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

export const clpLong = (n: number) => `$${n.toLocaleString('es-CL')} CLP`;
