export const SESSION_MESSAGE_LIMIT = 30;

export function canAcceptSessionMessage(currentCount: number): boolean {
  if (!Number.isInteger(currentCount) || currentCount < 0) {
    throw new RangeError(
      "A contagem da sessão precisa ser um inteiro maior ou igual a zero.",
    );
  }
  return currentCount < SESSION_MESSAGE_LIMIT;
}
