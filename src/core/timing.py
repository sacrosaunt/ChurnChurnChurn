from datetime import datetime, timedelta
from typing import Dict, List
from .scoring import Scoring

class Timing:
    """Handles timing calculations and optimization for bank offers."""
    
    @staticmethod
    def calculate_optimal_timing(offer: Dict, start_date: datetime, pay_cycle_days: int, is_first_offer: bool = False) -> Dict:
        """Calculate optimal timing for account opening and deposits."""
        details = offer['details']
        
        # Parse deposit deadline
        days_for_deposit_str = str(details.get('days_for_deposit', 'N/A'))
        days_for_deposit = 0
        if days_for_deposit_str != 'N/A':
            try:
                days_for_deposit = int(''.join(filter(str.isdigit, days_for_deposit_str)))
            except (ValueError, TypeError):
                days_for_deposit = 60  # Default fallback
        
        # Parse holding period
        holding_period_str = str(details.get('must_be_open_for', '0'))
        try:
            holding_period = int(''.join(filter(str.isdigit, holding_period_str))) or 0
        except (ValueError, TypeError):
            holding_period = 0
        
        # Calculate optimal timing with smart delay logic
        account_open_date = start_date
        
        # Smart delay: Only apply to offers that aren't the first one
        # and only if we have a very long deposit window (>90 days)
        if not is_first_offer and days_for_deposit > 90:  # Very conservative threshold
            # Consider delaying by up to 1 pay cycle to maximize deposit window
            potential_delay = min(pay_cycle_days, days_for_deposit - 90)
            if potential_delay > 0:
                account_open_date = start_date + timedelta(days=potential_delay)
        
        # Calculate deposit requirements
        deposits_required = int(str(details.get('num_required_deposits', '1')).replace(' days', '')) or 1
        
        # Get minimum deposit amount
        min_deposit = int(str(details.get('minimum_deposit_amount', '0')).replace(',', '')) or 0
        
        # Calculate multiple deposit dates if required
        deposit_dates = []
        if deposits_required > 1:
            # Spread deposits evenly across the deposit window
            deposit_interval = days_for_deposit // deposits_required
            for i in range(deposits_required):
                deposit_date = account_open_date + timedelta(days=(i + 1) * deposit_interval)
                deposit_dates.append({
                    'date': deposit_date,
                    'amount': min_deposit,  # Each deposit is the minimum required amount
                    'number': i + 1
                })
        else:
            # Single deposit - use the deadline
            deposit_dates.append({
                'date': account_open_date + timedelta(days=days_for_deposit),
                'amount': min_deposit,
                'number': 1
            })
        
        deposit_deadline = account_open_date + timedelta(days=days_for_deposit)
        
        # If we have a holding period, calculate when the account can be closed
        account_close_date = None
        if holding_period > 0:
            account_close_date = account_open_date + timedelta(days=holding_period)
        
        # Calculate bonus payout date (typically 2 pay cycles after last deposit)
        last_deposit_date = deposit_dates[-1]['date']
        bonus_payout_date = last_deposit_date + timedelta(days=pay_cycle_days * 2)
        
        # Ensure account closure doesn't occur before bonus payout
        if account_close_date and bonus_payout_date > account_close_date:
            # Push account closure to after bonus payout (with some buffer)
            account_close_date = bonus_payout_date + timedelta(days=7)  # 1 week buffer
        
        return {
            'account_open_date': account_open_date,
            'deposit_deadline': deposit_deadline,
            'deposit_dates': deposit_dates,
            'account_close_date': account_close_date,
            'bonus_payout_date': bonus_payout_date,
            'days_for_deposit': days_for_deposit,
            'holding_period': holding_period,
            'deposits_required': deposits_required
        }
    
    @staticmethod
    def calculate_optimal_timing_with_strategy(offer: Dict, start_date: datetime, pay_cycle_days: int, is_first_offer: bool, strategy: Dict) -> Dict:
        """Calculate optimal timing for account opening and deposits with specific strategy."""
        details = offer['details']

        # Parse deposit deadline
        days_for_deposit_str = str(details.get('days_for_deposit', 'N/A'))
        days_for_deposit = 0
        if days_for_deposit_str != 'N/A':
            try:
                days_for_deposit = int(''.join(filter(str.isdigit, days_for_deposit_str)))
            except (ValueError, TypeError):
                days_for_deposit = 60  # Default fallback

        # Parse holding period
        holding_period_str = str(details.get('must_be_open_for', '0'))
        try:
            holding_period = int(''.join(filter(str.isdigit, holding_period_str))) or 0
        except (ValueError, TypeError):
            holding_period = 0

        # Apply holding strategy
        if strategy['holding_strategy'] == 'extended' and holding_period > 0:
            holding_period = max(holding_period, 180)  # Extend to at least 6 months

        # Calculate optimal timing with smart delay logic
        account_open_date = start_date

        # Smart delay: Only apply to offers that aren't the first one
        # and only if we have a very long deposit window (>90 days)
        if not is_first_offer and days_for_deposit > 90:  # Very conservative threshold
            # Consider delaying by up to 1 pay cycle to maximize deposit window
            potential_delay = min(pay_cycle_days, days_for_deposit - 90)
            if potential_delay > 0:
                account_open_date = start_date + timedelta(days=potential_delay)

        # Calculate deposit requirements
        deposits_required = int(str(details.get('num_required_deposits', '1')).replace(' days', '')) or 1
        
        # Get minimum deposit amount
        min_deposit = int(str(details.get('minimum_deposit_amount', '0')).replace(',', '')) or 0
        
        # Calculate multiple deposit dates if required
        deposit_dates = []
        if deposits_required > 1:
            # Spread deposits evenly across the deposit window
            deposit_interval = days_for_deposit // deposits_required
            for i in range(deposits_required):
                deposit_date = account_open_date + timedelta(days=(i + 1) * deposit_interval)
                deposit_dates.append({
                    'date': deposit_date,
                    'amount': min_deposit,  # Each deposit is the minimum required amount
                    'number': i + 1
                })
        else:
            # Single deposit - use dynamic deposit timing strategy
            deposit_offset = strategy.get('deposit_timing_days', days_for_deposit // 2)
            # Ensure deposit is within the allowed window
            deposit_offset = min(deposit_offset, days_for_deposit)
            
            deposit_dates.append({
                'date': account_open_date + timedelta(days=deposit_offset),
                'amount': min_deposit,
                'number': 1
            })
        
        deposit_deadline = account_open_date + timedelta(days=days_for_deposit)
        
        # If we have a holding period, calculate when the account can be closed
        account_close_date = None
        if holding_period > 0:
            account_close_date = account_open_date + timedelta(days=holding_period)
        
        # Calculate bonus payout date (typically 2 pay cycles after last deposit)
        last_deposit_date = deposit_dates[-1]['date']
        bonus_payout_date = last_deposit_date + timedelta(days=pay_cycle_days * 2)
        
        # Ensure account closure doesn't occur before bonus payout
        if account_close_date and bonus_payout_date > account_close_date:
            # Push account closure to after bonus payout (with some buffer)
            account_close_date = bonus_payout_date + timedelta(days=7)  # 1 week buffer
        
        return {
            'account_open_date': account_open_date,
            'deposit_deadline': deposit_deadline,
            'deposit_dates': deposit_dates,
            'account_close_date': account_close_date,
            'bonus_payout_date': bonus_payout_date,
            'days_for_deposit': days_for_deposit,
            'holding_period': holding_period,
            'deposits_required': deposits_required
        }
    
    @staticmethod
    def _validate_deposit_timing(offer: Dict, optimal_timing: Dict) -> bool:
        """Validate that deposits are made within the required timeframe."""
        details = offer['details']
        
        # Get the "must deposit within" parameter
        days_for_deposit_str = str(details.get('days_for_deposit', 'N/A'))
        if days_for_deposit_str == 'N/A':
            return True  # No deposit deadline specified, so it's valid
        
        try:
            days_for_deposit = int(''.join(filter(str.isdigit, days_for_deposit_str)))
        except (ValueError, TypeError):
            return True  # Invalid format, assume it's valid
        
        # Check each deposit date
        for deposit in optimal_timing['deposit_dates']:
            deposit_date = deposit['date']
            account_open_date = optimal_timing['account_open_date']
            
            # Calculate days from account opening to deposit
            days_from_opening = (deposit_date - account_open_date).days
            
            # If deposit is made after the required deadline, it's invalid
            if days_from_opening > days_for_deposit:
                return False
        
        return True
    
    @staticmethod
    def _generate_dynamic_timing_strategies(offers: List[Dict], current_date: datetime, pay_cycle_days: int) -> List[Dict]:
        """Generate dynamic timing strategies based on offer deadlines and deposit windows."""
        strategies = []
        
        # Find the maximum possible delay based on the earliest expiration date
        max_delay_days = 0
        for offer in offers:
            expiration_date = offer['details'].get('deal_expiration_date')
            if expiration_date and expiration_date != 'N/A':
                try:
                    expiration = datetime.strptime(expiration_date, '%Y-%m-%d')
                    days_until_expiration = (expiration - current_date).days
                    if days_until_expiration > max_delay_days:
                        max_delay_days = days_until_expiration
                except ValueError:
                    pass
        
        # If no expiration dates found, use a reasonable default
        if max_delay_days == 0:
            max_delay_days = 90  # 90 days default
        
        # Generate delay strategies (1 day increments up to max)
        delay_strategies = list(range(0, min(max_delay_days, 90) + 1))  # Cap at 90 days
        
        # Generate deposit timing strategies (1 day increments within deposit windows)
        deposit_timing_strategies = []
        for offer in offers:
            days_for_deposit_str = str(offer['details'].get('days_for_deposit', 'N/A'))
            if days_for_deposit_str != 'N/A':
                try:
                    days_for_deposit = int(''.join(filter(str.isdigit, days_for_deposit_str)))
                    # Test every day within the deposit window
                    for day in range(1, days_for_deposit + 1):
                        deposit_timing_strategies.append(day)
                except (ValueError, TypeError):
                    deposit_timing_strategies.append(90)  # Default 90 days
            else:
                deposit_timing_strategies.append(90)  # Default 90 days
        
        # Remove duplicates and sort
        deposit_timing_strategies = sorted(list(set(deposit_timing_strategies)))
        
        # Generate holding period strategies
        holding_strategies = ['minimal', 'extended']
        
        # Generate all combinations
        for delay_days in delay_strategies:
            for deposit_timing in deposit_timing_strategies:
                for holding_strategy in holding_strategies:
                    strategies.append({
                        'delay_days': delay_days,
                        'deposit_timing_days': deposit_timing,
                        'holding_strategy': holding_strategy
                    })
        
        print(f"Generated {len(strategies)} dynamic timing strategies:")
        print(f"  - Delay days: 0 to {max(delay_strategies)}")
        print(f"  - Deposit timing: {min(deposit_timing_strategies)} to {max(deposit_timing_strategies)} days")
        print(f"  - Holding strategies: {holding_strategies}")
        
        return strategies
