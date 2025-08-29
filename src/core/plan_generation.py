from datetime import datetime, timedelta
from typing import List, Dict, Optional
from itertools import permutations, product

from .tier_parsing import TierParsing
from .scoring import Scoring
from .timing import Timing

class PlanGeneration:
    """Handles main planning logic and plan generation for bank offers."""
    
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
        tier_combinations = PlanGeneration._generate_tier_combinations(offer_groups)
        
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
            timing_strategies = Timing._generate_dynamic_timing_strategies(offers_to_permute, current_date, pay_cycle_days)
            
            total_combinations = len(list(permutations(offers_to_permute))) * len(timing_strategies)
            
            for perm in permutations(offers_to_permute):
                for strategy in timing_strategies:
                    # Test this permutation with timing strategy
                    plan = PlanGeneration._evaluate_permutation_with_strategy(
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
            optimal_timing = Timing.calculate_optimal_timing_with_strategy(
                offer, start_date, pay_cycle_days, i == 0, strategy
            )
            
            # Validate that deposits are made within the required timeframe
            if not Timing._validate_deposit_timing(offer, optimal_timing):
                return None  # This permutation is invalid due to deposit timing
            
            # Calculate bonus amount
            bonus_amount = float(str(offer['details'].get('bonus_to_be_received', '0')).replace(',', '')) or 0
            total_bonus += bonus_amount
            
            # Calculate deposit requirements
            min_deposit, deposits_required, initial_deposit, total_deposit_required = Scoring.calculate_deposit_requirements(offer)
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
        unopened_offers = TierParsing.get_unopened_offers(offers)
        
        if not unopened_offers:
            return None
        
        # Calculate priority scores and risk levels for all offers
        offers_with_scores = []
        current_date = datetime.now()
        
        for offer in unopened_offers:
            priority_score = Scoring.calculate_priority_score(offer, pay_cycle_days, average_paycheck)
            risk_level = Scoring.calculate_risk_level(offer)
            min_deposit, deposits_required, initial_deposit, total_deposit_required = Scoring.calculate_deposit_requirements(offer)
            
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
        best_plan = PlanGeneration._find_optimal_combination(
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
