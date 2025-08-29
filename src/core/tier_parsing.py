import json
import re
from typing import List, Dict

class TierParsing:
    """Handles bonus tier parsing and tier variant creation for bank offers."""
    
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
            return TierParsing.parse_bonus_tiers(bonus_tiers_detailed)

    @staticmethod
    def create_tier_variants(offer: Dict) -> List[Dict]:
        """Create separate offer variants for each bonus tier."""
        details = offer['details']
        
        # Try detailed tier parsing first
        tiers = TierParsing.parse_detailed_tiers(
            details.get('bonus_tiers_detailed', ''),
            details.get('total_deposit_by_tier', '')
        )
        
        # Fallback to basic tier parsing if detailed parsing fails
        if not tiers:
            bonus_tiers_str = details.get('bonus_tiers', '')
            tiers = TierParsing.parse_bonus_tiers(bonus_tiers_str)
        
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
                tier_variants = TierParsing.create_tier_variants(offer)
                unopened.extend(tier_variants)
        
        return unopened
