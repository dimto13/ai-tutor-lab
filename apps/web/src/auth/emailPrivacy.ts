function isMaskableCharacter(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

export function maskEmailAddress(email: string): string {
  const characters = Array.from(email);
  const maskableIndexes = characters
    .map((character, index) => (isMaskableCharacter(character) ? index : -1))
    .filter((index) => index >= 0);

  if (maskableIndexes.length === 0) return email;

  const visibleCount = Math.max(1, Math.floor(maskableIndexes.length * 0.2));
  const visibleIndexes = new Set<number>();

  if (visibleCount === 1) {
    visibleIndexes.add(maskableIndexes[0]!);
  } else {
    for (let slot = 0; slot < visibleCount; slot += 1) {
      const position = Math.round((slot * (maskableIndexes.length - 1)) / (visibleCount - 1));
      visibleIndexes.add(maskableIndexes[position]!);
    }
  }

  return characters
    .map((character, index) =>
      isMaskableCharacter(character) && !visibleIndexes.has(index) ? "*" : character,
    )
    .join("");
}

export function emailMaskRatio(email: string, maskedEmail: string): number {
  const originalCharacters = Array.from(email);
  const maskedCharacters = Array.from(maskedEmail);
  let maskableCount = 0;
  let maskedCount = 0;

  for (let index = 0; index < originalCharacters.length; index += 1) {
    const originalCharacter = originalCharacters[index]!;
    if (!isMaskableCharacter(originalCharacter)) continue;
    maskableCount += 1;
    if (maskedCharacters[index] === "*") maskedCount += 1;
  }

  return maskableCount === 0 ? 0 : maskedCount / maskableCount;
}
