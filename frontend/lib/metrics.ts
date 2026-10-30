export const METRIC_HELP: Record<string, string> = {
  mae: "Mean Absolute Error: the average absolute gap between predicted and actual prices. Lower is better and it is expressed in the stock's currency.",
  mse: "Mean Squared Error: the average of squared errors. Large misses are penalised heavily, so MSE is sensitive to outliers.",
  rmse: "Root Mean Squared Error: the square root of MSE, back in price units. Lower is better.",
  r2: "R² (coefficient of determination): the share of test-period price variation explained by the model. Negative values are valid and mean the model is worse than predicting the test mean.",
  mape: "Mean Absolute Percentage Error: average error as a percentage of the actual price. Useful for comparing across price levels.",
  directional:
    "Directional accuracy: the percentage of observations where the predicted up/down direction matched the actual direction relative to the previous close. Direction and magnitude are different skills.",
  naive:
    "Naive baseline: predict that the next close equals the previous close. Stock prices are persistent, so this is a demanding benchmark.",
  slope: "Slope (b1): the change in the predicted current close for a one-unit increase in the previous close, holding this one-feature model fixed.",
  intercept: "Intercept (b0): the predicted close when the previous close is zero. Usually not financially meaningful on its own.",
  maePct: "Difference between the regression MAE and the naive MAE on identical test observations.",
  volatility:
    "Annualised historical volatility: daily return standard deviation multiplied by √252. A backward-looking risk estimate, not a forecast.",
  drawdown:
    "Drawdown: the percentage decline from the previous peak close. Maximum drawdown is the deepest such decline in the window.",
  sharpe:
    "A simple return-to-risk ratio computed from average daily return and volatility. Shown for description only, not as investment advice.",
  observations:
    "Count of usable trading observations retrieved from Yahoo Finance for the selected window, after cleaning.",
  split:
    "The chronological share of observations used for fitting. The remaining observations are held out for evaluation; observations are never shuffled.",
  band:
    "Empirical error band: the 5th–95th percentile of historical out-of-sample residuals applied to the point forecast. It is not a statistically guaranteed confidence interval.",
  baseline: "A simple benchmark that predicts tomorrow's close equals today's close. Used to judge whether the regression adds value.",
  correlation:
    "Pearson correlation of daily returns between two stocks. +1 means they move together, 0 means no linear relationship, −1 means opposite moves. Correlation is not causation.",
};
