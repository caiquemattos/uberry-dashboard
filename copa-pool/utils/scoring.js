/**
 * Calcula pontos de um palpite comparado com resultado real.
 * Regras:
 *   - Placar exato: 15 pts (direto, sem acumular)
 *   - Parcial (acumulativo):
 *       +5 vencedor/empate correto
 *       +2 gols do time A corretos
 *       +2 gols do time B corretos
 *       +2 diferença de gols correta
 *   - Multiplicadores por fase aplicados ao final
 */

const PHASE_MULTIPLIERS = {
  groups:         1.0,
  round_of_32:    1.2,
  round_of_16:    1.5,
  quarterfinals:  2.0,
  semifinals:     2.0,
  third_place:    2.0,
  final:          3.0,
};

function calculatePoints(predHome, predAway, realHome, realAway, phase) {
  const mult = PHASE_MULTIPLIERS[phase] ?? 1.0;

  if (predHome === realHome && predAway === realAway) {
    return { points: Math.round(15 * mult), type: 'exact' };
  }

  let pts = 0;

  const predOutcome = predHome > predAway ? 'H' : predHome < predAway ? 'A' : 'D';
  const realOutcome = realHome > realAway ? 'H' : realHome < realAway ? 'A' : 'D';

  if (predOutcome === realOutcome) pts += 5;
  if (predHome === realHome) pts += 2;
  if (predAway === realAway) pts += 2;
  if ((predHome - predAway) === (realHome - realAway)) pts += 2;

  if (pts === 0) return { points: 0, type: 'miss' };
  return { points: Math.round(pts * mult), type: 'partial' };
}

/**
 * Retorna true se o prazo de palpite já fechou (10 min antes do jogo).
 */
function isPredictionLocked(scheduledAt) {
  const matchTime = new Date(scheduledAt).getTime();
  const lockTime = matchTime - 10 * 60 * 1000;
  return Date.now() >= lockTime;
}

module.exports = { calculatePoints, isPredictionLocked, PHASE_MULTIPLIERS };
