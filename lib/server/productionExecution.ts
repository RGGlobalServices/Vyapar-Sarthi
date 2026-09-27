import { ApiError } from '@/lib/server/http';

export type QuantityRuleType = 'FIXED' | 'PERCENTAGE_OF_INPUT' | 'PERCENTAGE_LOSS' | 'REMAINING' | 'MANUAL';

export function calculateExpectedQuantity(ruleType: QuantityRuleType, configuredValue: number | null, totalInputQty: number): number | null {
  if (ruleType === 'FIXED') return configuredValue;
  if (ruleType === 'PERCENTAGE_OF_INPUT') return totalInputQty * (configuredValue || 0) / 100;
  if (ruleType === 'PERCENTAGE_LOSS') return totalInputQty * (configuredValue || 0) / 100;
  return null; 
}

export function validateBalance(inputs: { qty: number, unit: string }[], outputs: { qty: number, unit: string }[], tolerancePct: number = 0) {
  const units = new Set([...inputs.map(i => i.unit), ...outputs.map(o => o.unit)]);
  if (units.size > 1) {
    throw new ApiError(400, 'All inputs and outputs must be in the same unit to perform mass balance.', 'INCOMPATIBLE_UNITS');
  }

  const inputTotal = inputs.reduce((sum, i) => sum + i.qty, 0);
  const outputTotal = outputs.reduce((sum, o) => sum + o.qty, 0);

  const diff = Math.abs(inputTotal - outputTotal);
  
  if (inputTotal > 0) {
    const diffPct = (diff / inputTotal) * 100;
    if (diffPct > tolerancePct) {
      throw new ApiError(400, `Stage balance mismatch. Total Input: ${inputTotal}, Total Output/Loss: ${outputTotal}, Diff: ${diffPct.toFixed(2)}%. Max allowed tolerance is ${tolerancePct}%`, 'STAGE_BALANCE_MISMATCH');
    }
  } else if (outputTotal > 0) {
     throw new ApiError(400, `Stage balance mismatch. Outputs exist but no inputs recorded.`, 'STAGE_BALANCE_MISMATCH');
  }

  return true;
}
