from datetime import datetime

class Utils:
    """Utility functions for formatting and display."""
    
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
