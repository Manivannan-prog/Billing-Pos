export const formatCurrency = (value) => {
  const amount = Number(value) || 0;

  return `\u20B9${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
