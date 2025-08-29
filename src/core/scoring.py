from datetime import datetime
from typing import Dict, Tuple

class Scoring:
    """Handles priority scoring and risk assessment for bank offers."""
    
    @staticmethod
    def calculate_priority_score(offer: Dict, pay_cycle_days: int, average_paycheck: float) -> int:
        """Calculate priority score for an offer based on multiple factors."""
        details = offer['details']
        score = 0
        
        # Calculate total deposit requirements
        min_deposit = float(str(details.get('minimum_deposit_amount', '0')).replace('$', '').replace(',', '')) or 0
        deposits_required_str = str(details.get('num_required_deposits', '1')).replace(' days', '')
        try:
            deposits_required = int(deposits_required_str) if deposits_required_str.strip() else 1
        except (ValueError, TypeError):
            deposits_required = 1
        initial_deposit = float(str(details.get('initial_deposit_amount', '0')).replace('$', '').replace(',', '')) or 0
        total_deposit_required = float(str(details.get('total_deposit_required', '0')).replace('$', '').replace(',', '')) or 0
        
        # If total_deposit_required is not available, calculate it
        if total_deposit_required == 0:
            total_deposit_required = min_deposit * deposits_required
        
        # Total deposit needed includes initial deposit + qualifying deposits
        total_deposit_needed = initial_deposit + total_deposit_required
        
        # Bonus amount weighted by total deposit amount (ROI-based scoring)
        bonus = float(str(details.get('bonus_to_be_received', '0')).replace('$', '').replace(',', '')) or 0
        if total_deposit_needed > 0:
            # Calculate ROI (bonus / total deposit) and weight it
            roi = bonus / total_deposit_needed
            score += roi * 1000  # Weight ROI heavily
        else:
            score += bonus * 0.3  # Fallback if no deposit info
        
        # Expiration urgency (earlier = better) - HIGHEST PRIORITY
        expiration_date = details.get('deal_expiration_date')
        if expiration_date and expiration_date != 'N/A':
            try:
                expiration = datetime.strptime(expiration_date, '%Y-%m-%d')
                today = datetime.now()
                days_until_expiration = (expiration - today).days
                
                if days_until_expiration <= 7:
                    score += 1000  # Expires within a week
                elif days_until_expiration <= 30:
                    score += 500   # Expires within a month
                elif days_until_expiration <= 90:
                    score += 200   # Expires within 3 months
            except ValueError:
                pass
        
        # Account holding period (LONGER = BETTER for multi-month offers)
        holding_period_str = str(details.get('must_be_open_for', '0'))
        try:
            holding_period = int(''.join(filter(str.isdigit, holding_period_str))) or 0
        except (ValueError, TypeError):
            holding_period = 0
        
        # Prioritize offers that take multiple months to complete
        if holding_period >= 180:  # 6+ months
            score += 300   # High priority for long-term offers
        elif holding_period >= 120:  # 4+ months
            score += 200   # Medium-high priority
        elif holding_period >= 90:   # 3+ months
            score += 150   # Medium priority
        elif holding_period >= 60:   # 2+ months
            score += 100   # Lower-medium priority
        elif holding_period >= 30:   # 1+ month
            score += 50    # Lower priority
        # No penalty for short holding periods
        
        # Deposit requirements (lower = better)
        if total_deposit_needed <= average_paycheck:
            score += 100  # Can be funded with one paycheck
        elif total_deposit_needed <= average_paycheck * 2:
            score += 50   # Can be funded with two paychecks
        else:
            score -= 50   # Penalty for high deposit requirements
        
        # Monthly fees (lower = better)
        monthly_fee = float(str(details.get('minimum_monthly_fee', '0')).replace('$', '').replace(',', '')) or 0
        if monthly_fee > 0:
            score -= monthly_fee * 12  # Annual fee penalty
        
        return round(score)
    
    @staticmethod
    def calculate_risk_level(offer: Dict) -> str:
        """Calculate risk level for an offer."""
        details = offer['details']
        risk_score = 0
        
        # Clawback clause
        if str(details.get('clawback_clause_present', '')).lower() == 'yes':
            risk_score += 3
        
        # High deposit requirements
        min_deposit = float(str(details.get('minimum_deposit_amount', '0')).replace('$', '').replace(',', '')) or 0
        if min_deposit > 5000:
            risk_score += 2
        
        # Long holding period
        holding_period_str = str(details.get('must_be_open_for', '0'))
        try:
            holding_period = int(''.join(filter(str.isdigit, holding_period_str))) or 0
        except (ValueError, TypeError):
            holding_period = 0
        if holding_period > 180:
            risk_score += 2
        
        # Monthly fees
        monthly_fee = float(str(details.get('minimum_monthly_fee', '0')).replace('$', '').replace(',', '')) or 0
        if monthly_fee > 10:
            risk_score += 1
        
        if risk_score <= 2:
            return 'low'
        elif risk_score <= 4:
            return 'medium'
        else:
            return 'high'
    
    @staticmethod
    def calculate_deposit_requirements(offer: Dict) -> Tuple[float, int, float, float]:
        """Calculate deposit requirements for an offer."""
        details = offer['details']
        min_deposit = float(str(details.get('minimum_deposit_amount', '0')).replace('$', '').replace(',', '')) or 0
        deposits_required_str = str(details.get('num_required_deposits', '1')).replace(' days', '')
        try:
            deposits_required = int(deposits_required_str) if deposits_required_str.strip() else 1
        except (ValueError, TypeError):
            deposits_required = 1
        initial_deposit = float(str(details.get('initial_deposit_amount', '0')).replace('$', '').replace(',', '')) or 0
        total_deposit_required = float(str(details.get('total_deposit_required', '0')).replace('$', '').replace(',', '')) or 0
        
        # If total_deposit_required is not available, calculate it
        if total_deposit_required == 0:
            total_deposit_required = min_deposit * deposits_required
        
        return min_deposit, deposits_required, initial_deposit, total_deposit_required
