import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from itertools import permutations, product
import re

class PlanningLogic:
    """Handles all planning calculations and algorithms for bank offer prioritization."""
    
    @staticmethod
    def parse_bonus_tiers(bonus_tiers_str: str) -> List[Dict]:
        """Parse bonus tiers string and return list of tier options."""
        if not bonus_tiers_str or bonus_tiers_str.lower() in ['single tier', 'n/a', 'processing...']:
            return []
        
        tiers = []
        # Pattern to match "Tier1: $X bonus for $Y deposit, Tier2: $Z bonus for $W deposit"
        # Updated to handle "Up to" text and more flexible formatting
        tier_pattern = r'Tier(\d+):\s*(?:Up to\s+)?\$?([\d,]+)\s*bonus\s*(?:for\s+)?\$?([\d,]+)\s*(?:deposit|monthly growth)'
        matches = re.findall(tier_pattern, bonus_tiers_str, re.IGNORECASE)
        
        for match in matches:
            tier_num = int(match[0])
            bonus_amount = float(match[1].replace(',', ''))
            deposit_amount = float(match[2].replace(',', ''))
            
            tiers.append({
                'tier_number': tier_num,
                'bonus_amount': bonus_amount,
                'deposit_amount': deposit_amount,
                'description': f"Tier {tier_num}: ${bonus_amount:,.0f} bonus for ${deposit_amount:,.0f} deposit"
            })
        
        return tiers

    @staticmethod
    def parse_detailed_tiers(bonus_tiers_detailed: str, total_deposit_by_tier: str) -> List[Dict]:
        """Parse detailed tier information from JSON format."""
        if not bonus_tiers_detailed or bonus_tiers_detailed.lower() in ['single tier', 'n/a', 'processing...']:
            return []
        
        try:
            # Try to parse as JSON
            tiers = json.loads(bonus_tiers_detailed)
            deposits = None
            
            if total_deposit_by_tier and total_deposit_by_tier.lower() not in ['single tier', 'n/a', 'processing...']:
                try:
                    deposits = json.loads(total_deposit_by_tier)
                except (json.JSONDecodeError, TypeError):
                    deposits = None
            
            result = []
            for tier in tiers:
                tier_info = {
                    'tier_number': tier.get('tier', 1),
                    'bonus_amount': float(tier.get('bonus', 0)),
                    'deposit_amount': float(tier.get('deposit', 0)),
                    'description': f"Tier {tier.get('tier', 1)}: ${tier.get('bonus', 0):,.0f} bonus for ${tier.get('deposit', 0):,.0f} deposit"
                }
                
                # Add total deposit if available
                if deposits:
                    matching_deposit = next((d for d in deposits if d.get('tier') == tier.get('tier')), None)
                    if matching_deposit:
                        tier_info['total_deposit'] = float(matching_deposit.get('total_deposit', tier.get('deposit', 0)))
                    else:
                        tier_info['total_deposit'] = tier_info['deposit_amount']
                else:
                    tier_info['total_deposit'] = tier_info['deposit_amount']
                
                result.append(tier_info)
            
            return result
        except (json.JSONDecodeError, TypeError, KeyError):
            # Fallback to regex parsing
            return PlanningLogic.parse_bonus_tiers(bonus_tiers_detailed)

    @staticmethod
    def create_tier_variants(offer: Dict) -> List[Dict]:
        """Create separate offer variants for each bonus tier."""
        details = offer['details']
        
        # Try detailed tier parsing first
        tiers = PlanningLogic.parse_detailed_tiers(
            details.get('bonus_tiers_detailed', ''),
            details.get('total_deposit_by_tier', '')
        )
        
        # Fallback to basic tier parsing if detailed parsing fails
        if not tiers:
            bonus_tiers_str = details.get('bonus_tiers', '')
            tiers = PlanningLogic.parse_bonus_tiers(bonus_tiers_str)
        
        if not tiers:
            # Single tier offer - return original offer
            return [offer]
        
        variants = []
        for tier in tiers:
            # Create a copy of the offer with tier-specific details
            tier_offer = offer.copy()
            tier_offer['details'] = details.copy()
            
            # Update with tier-specific values
            tier_offer['details']['bonus_to_be_received'] = str(tier['bonus_amount'])
            tier_offer['details']['minimum_deposit_amount'] = str(tier['deposit_amount'])
            tier_offer['details']['total_deposit_required'] = f"${tier.get('total_deposit', tier['deposit_amount']):,.0f}"
            
            # Update account title to include tier info
            original_title = details.get('account_title', 'Unknown Account')
            tier_offer['details']['account_title'] = f"{original_title} - {tier['description']}"
            
            # Add tier metadata
            tier_offer['tier_info'] = tier
            tier_offer['is_tier_variant'] = True
            tier_offer['original_offer_id'] = offer['id']
            
            variants.append(tier_offer)
        
        return variants

    @staticmethod
    def get_unopened_offers(offers: Dict) -> List[Dict]:
        """Filter offers to get only unopened ones, including tier variants."""
        unopened = []
        for offer_id, offer in offers.items():
            if (not offer['user_controlled']['opened'] and 
                not offer['user_controlled']['deposited'] and 
                not offer['user_controlled']['received'] and
                offer['status'] != 'processing' and 
                offer['status'] != 'failed'):
                
                # Create tier variants for this offer
                tier_variants = PlanningLogic.create_tier_variants(offer)
                unopened.extend(tier_variants)
        
        return unopened
    
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
    def _find_optimal_combination(offers: List[Dict], current_date: datetime, pay_cycle_days: int, accounts_per_paycycle: int) -> Optional[Dict]:
        """Find the optimal combination of offers using permutations to maximize total bonus."""
        if not offers:
            return None
        
        # Group offers by original offer ID to handle tier combinations
        offer_groups = {}
        for offer in offers:
            original_id = offer.get('original_offer_id', offer['id'])
            if original_id not in offer_groups:
                offer_groups[original_id] = []
            offer_groups[original_id].append(offer)
        
        # Generate all possible tier combinations
        tier_combinations = PlanningLogic._generate_tier_combinations(offer_groups)
        
        best_plan = None
        best_total_bonus = 0
        
        print(f"Testing {len(tier_combinations)} tier combinations...")
        
        for combination_idx, tier_combination in enumerate(tier_combinations):
            if combination_idx % 100 == 0:
                print(f"Progress: {combination_idx}/{len(tier_combinations)} combinations tested...")
            
            # Limit permutations to avoid excessive computation (max 6 offers = 720 permutations)
            max_offers_to_permute = min(len(tier_combination), 6)
            offers_to_permute = tier_combination[:max_offers_to_permute]
            
            # Generate dynamic timing strategies based on offer deadlines
            timing_strategies = PlanningLogic._generate_dynamic_timing_strategies(offers_to_permute, current_date, pay_cycle_days)
            
            total_combinations = len(list(permutations(offers_to_permute))) * len(timing_strategies)
            
            for perm in permutations(offers_to_permute):
                for strategy in timing_strategies:
                    # Test this permutation with timing strategy
                    plan = PlanningLogic._evaluate_permutation_with_strategy(
                        perm, current_date, pay_cycle_days, accounts_per_paycycle, strategy
                    )
                    
                    if plan and plan['total_bonus'] > best_total_bonus:
                        best_plan = plan
                        best_total_bonus = plan['total_bonus']
                        print(f"New best plan found: ${best_total_bonus:,.2f} (Strategy: {strategy})")
        
        return best_plan

    @staticmethod
    def _generate_tier_combinations(offer_groups: Dict) -> List[List[Dict]]:
        """Generate all possible combinations of tier selections."""
        combinations = []
        
        # Get all offer groups
        group_ids = list(offer_groups.keys())
        
        # Generate all possible combinations using cartesian product
        
        # Create list of tier options for each offer group
        tier_options = []
        for group_id in group_ids:
            group_offers = offer_groups[group_id]
            tier_options.append(group_offers)
        
        # Generate all possible combinations
        for combination in product(*tier_options):
            # Convert to list and add to combinations
            combinations.append(list(combination))
        
        print(f"Generated {len(combinations)} tier combinations from {len(group_ids)} offer groups")
        
        # Sort combinations by total potential bonus (highest first) for better optimization
        combinations.sort(key=lambda combo: sum(
            float(str(offer['details'].get('bonus_to_be_received', '0')).replace(',', '')) or 0
            for offer in combo
        ), reverse=True)
        
        return combinations

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
    def _evaluate_permutation_with_strategy(offer_permutation: tuple, current_date: datetime, pay_cycle_days: int, accounts_per_paycycle: int, strategy: Dict) -> Optional[Dict]:
        """Evaluate a specific permutation of offers and return the plan if valid."""
        timeline = []
        total_bonus = 0
        total_deposit_needed = 0
        total_monthly_fees = 0
        pay_cycles_used = 0
        
        for i, offer in enumerate(offer_permutation):
            # Calculate start date based on pay cycle quota
            if i > 0 and i % accounts_per_paycycle == 0:
                pay_cycles_used += 1
            
            start_date = current_date + timedelta(days=pay_cycles_used * pay_cycle_days)
            
            # Apply timing strategy
            start_date += timedelta(days=strategy['delay_days'])
            
            # Check if this offer can start before its expiration
            expiration_date = offer['details'].get('deal_expiration_date')
            if expiration_date and expiration_date != 'N/A':
                try:
                    expiration = datetime.strptime(expiration_date, '%Y-%m-%d')
                    if start_date > expiration:
                        return None  # This permutation is invalid
                except ValueError:
                    pass  # Invalid date format, continue
            
            # Calculate optimal timing for this offer with strategy
            optimal_timing = PlanningLogic.calculate_optimal_timing_with_strategy(
                offer, start_date, pay_cycle_days, i == 0, strategy
            )
            
            # Validate that deposits are made within the required timeframe
            if not PlanningLogic._validate_deposit_timing(offer, optimal_timing):
                return None  # This permutation is invalid due to deposit timing
            
            # Calculate bonus amount
            bonus_amount = float(str(offer['details'].get('bonus_to_be_received', '0')).replace(',', '')) or 0
            total_bonus += bonus_amount
            
            # Calculate deposit requirements
            min_deposit, deposits_required, initial_deposit, total_deposit_required = PlanningLogic.calculate_deposit_requirements(offer)
            total_deposit_needed += initial_deposit + total_deposit_required
            
            # Calculate monthly fees
            monthly_fee = float(str(offer['details'].get('minimum_monthly_fee', '0')).replace(',', '')) or 0
            total_monthly_fees += monthly_fee
            
            timeline.append({
                'offer': offer,
                'timing': optimal_timing,
                'bonus_amount': bonus_amount,
                'deposit_requirements': {
                    'min_deposit': min_deposit,
                    'deposits_required': deposits_required,
                    'initial_deposit': initial_deposit,
                    'total_deposit_required': total_deposit_required
                },
                'monthly_fee': monthly_fee
            })
        
        # Convert to the structure expected by the frontend
        timeline_items = []
        for i, item in enumerate(timeline):
            timeline_items.append({
                'offer': item['offer'],
                'position': i + 1,
                'start_date': item['timing']['account_open_date'].isoformat(),
                'estimated_completion': item['timing']['bonus_payout_date'].isoformat(),
                'pay_cycle': (i // accounts_per_paycycle) + 1,
                'timing': item['timing']
            })
        
        # Calculate total timeline duration
        total_pay_cycles = (len(timeline) - 1) // accounts_per_paycycle + 1
        estimated_duration = total_pay_cycles * pay_cycle_days
        
        # Add completion time for the last offer (2 pay cycles after start)
        estimated_duration += pay_cycle_days * 2
        
        return {
            'offers': [item['offer'] for item in timeline],
            'timeline': timeline_items,
            'total_bonus': total_bonus,
            'total_monthly_fees': total_monthly_fees,
            'estimated_duration': estimated_duration,
            'total_pay_cycles': total_pay_cycles,
            'accounts_per_paycycle': accounts_per_paycycle
        }
    
    @staticmethod
    def generate_plan(offers: Dict, pay_cycle_days: int, average_paycheck: float, accounts_per_paycycle: int) -> Optional[Dict]:
        """Generate a comprehensive plan for using unopened offers using permutation optimization."""
        unopened_offers = PlanningLogic.get_unopened_offers(offers)
        
        if not unopened_offers:
            return None
        
        # Calculate priority scores and risk levels for all offers
        offers_with_scores = []
        current_date = datetime.now()
        
        for offer in unopened_offers:
            priority_score = PlanningLogic.calculate_priority_score(offer, pay_cycle_days, average_paycheck)
            risk_level = PlanningLogic.calculate_risk_level(offer)
            min_deposit, deposits_required, initial_deposit, total_deposit_required = PlanningLogic.calculate_deposit_requirements(offer)
            
            offers_with_scores.append({
                **offer,
                'priority_score': priority_score,
                'risk_level': risk_level,
                'min_deposit': min_deposit,
                'deposits_required': deposits_required,
                'initial_deposit': initial_deposit,
                'total_deposit_required': total_deposit_required,
                'total_deposit_needed': initial_deposit + total_deposit_required
            })
        
        # Filter out offers that would start after their expiration date
        valid_offers = []
        for offer in offers_with_scores:
            # Check expiration date
            expiration_date = offer['details'].get('deal_expiration_date')
            if expiration_date and expiration_date != 'N/A':
                try:
                    expiration = datetime.strptime(expiration_date, '%Y-%m-%d')
                    # If the offer would start after expiration, skip it
                    if current_date > expiration:
                        continue
                except ValueError:
                    pass  # Invalid date format, include the offer
            
            valid_offers.append(offer)
        
        if not valid_offers:
            return None
        
        # Find optimal combination using permutations
        best_plan = PlanningLogic._find_optimal_combination(
            valid_offers, current_date, pay_cycle_days, accounts_per_paycycle
        )
        
        if best_plan:
            # Add tier selection summary
            tier_selections = []
            for offer in best_plan['offers']:
                if offer.get('is_tier_variant') and offer.get('tier_info'):
                    tier_selections.append({
                        'bank_name': offer['details'].get('bank_name', 'Unknown Bank'),
                        'original_offer_id': offer.get('original_offer_id'),
                        'selected_tier': offer['tier_info']['description'],
                        'bonus_amount': offer['tier_info']['bonus_amount'],
                        'deposit_amount': offer['tier_info']['deposit_amount']
                    })
            
            best_plan['tier_selections'] = tier_selections
        
        return best_plan
    
    @staticmethod
    def format_currency(amount: float) -> str:
        """Format amount as currency."""
        return f"${amount:,.2f}"
    
    @staticmethod
    def format_date(date_str: str) -> str:
        """Format date string for display."""
        try:
            # Handle ISO format dates
            if 'T' in date_str:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                # Handle YYYY-MM-DD format
                date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            return date_obj.strftime('%b %d, %Y')
        except Exception as e:
            print(f"Error formatting date '{date_str}': {e}")
            return date_str
    
    @staticmethod
    def get_risk_level_color(risk_level: str) -> str:
        """Get CSS classes for risk level colors."""
        colors = {
            'low': 'text-green-600 bg-green-100',
            'medium': 'text-yellow-600 bg-yellow-100',
            'high': 'text-red-600 bg-red-100'
        }
        return colors.get(risk_level, 'text-gray-600 bg-gray-100')
    
    @staticmethod
    def get_risk_level_text(risk_level: str) -> str:
        """Get display text for risk level."""
        texts = {
            'low': 'Low Risk',
            'medium': 'Medium Risk',
            'high': 'High Risk'
        }
        return texts.get(risk_level, 'Unknown Risk') 