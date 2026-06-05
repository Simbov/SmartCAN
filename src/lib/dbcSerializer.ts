import type { DbcDatabase } from './dbcParser';

/**
 * Serializes a DbcDatabase structure back into a standard Vector .dbc format string.
 */
export function serializeDbc(database: DbcDatabase): string {
  const lines: string[] = [];

  // 1. Nodes definition
  const nodesStr = database.nodes.join(' ');
  lines.push(`BU_: ${nodesStr}`);

  // Keep track of value descriptions (VAL_ lines) to output at the end
  const valLines: string[] = [];

  // 2. Messages and Signals
  Object.values(database.messages).forEach((msg) => {
    lines.push(`BO_ ${msg.id} ${msg.name}: ${msg.dlc} ${msg.sender}`);

    msg.signals.forEach((sig) => {
      const byteOrderStr = sig.isLittleEndian ? '1' : '0';
      const signedStr = sig.isSigned ? '-' : '+';
      const receiversStr = sig.receivers.length > 0 ? sig.receivers.join(' ') : 'Vector__XXX';

      lines.push(
        ` SG_ ${sig.name} : ${sig.startBit}|${sig.length}@${byteOrderStr}${signedStr} (${sig.factor},${sig.offset}) [${sig.min}|${sig.max}] "${sig.unit}" ${receiversStr}`
      );

      // Collect value descriptions
      if (sig.valueDescriptions && Object.keys(sig.valueDescriptions).length > 0) {
        const pairs = Object.entries(sig.valueDescriptions)
          .map(([val, desc]) => `${val} "${desc}"`)
          .join(' ');
        valLines.push(`VAL_ ${msg.id} ${sig.name} ${pairs} ;`);
      }
    });
  });

  // Append value descriptions at the end
  if (valLines.length > 0) {
    lines.push('');
    lines.push(...valLines);
  }

  // Return content ending with a single newline
  return lines.join('\n') + '\n';
}
