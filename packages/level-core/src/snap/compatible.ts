import { getPieceConstraints, type PieceId } from '@roomquest/schema';

/**
 * Extra same-session snap pairs beyond "held piece type == target piece type".
 *
 * `KIT_CATALOG` currently has no cross-type snap substitutes (a plank must
 * not land on a ramp target). This table is the catalog-shaped extension
 * point X-04 calls for — keep it empty until the kit grows a real pair.
 */
const CATALOG_SNAP_SUBSTITUTES: Readonly<Partial<Record<PieceId, readonly PieceId[]>>> =
  {};

/**
 * Whether a held piece may snap onto a target of `targetPiece`.
 *
 * Rules:
 * 1. Same piece type always matches (the plan's `playerBuilt` placements).
 * 2. Plus any substitutes listed for that piece in {@link KIT_CATALOG}'s
 *    companion table above.
 *
 * The catalog entry is read so a missing kit id cannot match.
 */
export function isSnapCompatible(
  heldPiece: PieceId,
  targetPiece: PieceId
): boolean {
  const constraints = getPieceConstraints(heldPiece);
  if (constraints.id !== heldPiece) return false;
  if (heldPiece === targetPiece) return true;
  const extras = CATALOG_SNAP_SUBSTITUTES[heldPiece];
  if (!extras) return false;
  return extras.includes(targetPiece);
}
