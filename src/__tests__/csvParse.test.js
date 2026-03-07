import { describe, it, expect } from 'vitest';
import { parseCSV, csvToDividendActuals, csvToHoldings } from '../utils/csvParser';

describe('parseCSV', () => {
  it('returns error for empty input', () => {
    var result = parseCSV('');
    expect(result.errors.length).toBe(1);
    expect(result.rows.length).toBe(0);
  });

  it('returns error for header-only CSV', () => {
    var result = parseCSV('Ticker,Shares,Price');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('header row');
  });

  it('returns error when no ticker column found', () => {
    var result = parseCSV('Name,Value\nApple,100');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('ticker');
  });

  // Format A: Transactions
  it('parses transaction format CSV', () => {
    var csv = 'Date,Action,Ticker,Shares,Price,Amount\n2024-01-15,BUY,SCHD,50,78.50,3925.00\n2024-03-20,DIVIDEND,SCHD,50,,38.75';
    var result = parseCSV(csv);
    expect(result.format).toBe('transactions');
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].ticker).toBe('SCHD');
    expect(result.rows[0].date).toBe('2024-01-15');
    expect(result.rows[0].shares).toBe(50);
    expect(result.rows[0].price).toBe(78.5);
    expect(result.rows[0].action).toBe('BUY');
    expect(result.rows[1].action).toBe('DIVIDEND');
    expect(result.rows[1].amount).toBe(38.75);
  });

  // Format B: Holdings
  it('parses holdings format CSV', () => {
    var csv = 'Ticker,Shares,Cost Basis Per Share,Account Type,Purchase Date\nSCHD,150,72.30,IRA,2022-06-15\nO,200,55.80,Taxable,2023-01-10';
    var result = parseCSV(csv);
    expect(result.format).toBe('holdings');
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].ticker).toBe('SCHD');
    expect(result.rows[0].shares).toBe(150);
    expect(result.rows[0].price).toBe(72.3);
    expect(result.rows[1].ticker).toBe('O');
    expect(result.rows[1].account).toBe('Taxable');
  });

  // Format C: Dividend History
  it('parses dividend history format CSV', () => {
    var csv = 'Date,Ticker,Amount,Type\n2024-03-15,SCHD,38.75,Qualified\n2024-03-28,O,51.00,Ordinary';
    var result = parseCSV(csv);
    expect(result.format).toBe('dividends');
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].ticker).toBe('SCHD');
    expect(result.rows[0].amount).toBe(38.75);
    expect(result.rows[1].amount).toBe(51);
  });

  it('handles MM/DD/YYYY date format', () => {
    var csv = 'Date,Ticker,Amount\n03/15/2024,AAPL,25.00';
    var result = parseCSV(csv);
    expect(result.rows[0].date).toBe('2024-03-15');
  });

  it('handles dollar signs and commas in amounts', () => {
    var csv = 'Ticker,Amount\nAAPL,"$1,234.56"';
    var result = parseCSV(csv);
    expect(result.rows[0].amount).toBe(1234.56);
  });

  it('rejects invalid ticker', () => {
    var csv = 'Ticker,Shares\nINVALID_LONG_TICKER,100';
    var result = parseCSV(csv);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('Invalid ticker');
    expect(result.rows.length).toBe(0);
  });

  it('handles quoted fields with commas', () => {
    var csv = 'Ticker,Shares,Price\nAAPL,100,"1,234.56"';
    var result = parseCSV(csv);
    expect(result.rows[0].price).toBe(1234.56);
  });

  it('handles mixed valid and invalid rows', () => {
    var csv = 'Ticker,Shares\nAAPL,100\nBAD!@#,50\nMSFT,200';
    var result = parseCSV(csv);
    expect(result.rows.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.rows[0].ticker).toBe('AAPL');
    expect(result.rows[1].ticker).toBe('MSFT');
  });

  it('handles empty lines gracefully', () => {
    var csv = 'Ticker,Shares\nAAPL,100\n\n\nMSFT,200\n';
    var result = parseCSV(csv);
    expect(result.rows.length).toBe(2);
  });

  it('handles column with "symbol" header', () => {
    var csv = 'Symbol,Qty\nVOO,50';
    var result = parseCSV(csv);
    expect(result.rows[0].ticker).toBe('VOO');
  });

  it('normalizes lowercase tickers to uppercase', () => {
    var csv = 'Ticker,Shares\naapl,10';
    var result = parseCSV(csv);
    expect(result.rows[0].ticker).toBe('AAPL');
  });
});

describe('csvToDividendActuals', () => {
  it('filters rows with ticker, date, and amount', () => {
    var rows = [
      { ticker: 'AAPL', date: '2024-03-15', amount: 25 },
      { ticker: 'MSFT', date: '2024-03-20' }, // no amount
      { ticker: 'GOOG', amount: 30 }, // no date
      { ticker: 'O', date: '2024-04-01', amount: 50 },
    ];
    var result = csvToDividendActuals(rows);
    expect(result.length).toBe(2);
    expect(result[0].ticker).toBe('AAPL');
    expect(result[1].ticker).toBe('O');
  });
});

describe('csvToHoldings', () => {
  it('filters rows with ticker and shares', () => {
    var rows = [
      { ticker: 'AAPL', shares: 100, price: 150 },
      { ticker: 'MSFT' }, // no shares
      { ticker: 'GOOG', shares: 50 },
    ];
    var result = csvToHoldings(rows);
    expect(result.length).toBe(2);
    expect(result[0].ticker).toBe('AAPL');
    expect(result[0].cost_basis).toBe(150);
    expect(result[1].ticker).toBe('GOOG');
    expect(result[1].cost_basis).toBe(0);
  });
});
