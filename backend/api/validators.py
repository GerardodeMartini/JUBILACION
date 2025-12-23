from django.core.exceptions import ValidationError
import re

class ComplexPasswordValidator:
    """
    Validate whether the password contains at least one uppercase letter,
    one number, and one special character.
    """
    def validate(self, password, user=None):
        if not re.search(r'[A-Z]', password):
            raise ValidationError(
                "La contraseña debe contener al menos una letra mayúscula.",
                code='password_no_upper',
            )
        if not re.search(r'\d', password):
            raise ValidationError(
                "La contraseña debe contener al menos un número.",
                code='password_no_number',
            )
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            raise ValidationError(
                "La contraseña debe contener al menos un carácter especial (ej. @, #, $).",
                code='password_no_symbol',
            )

    def get_help_text(self):
        return "Tu contraseña debe contener al menos una letra mayúscula, un número y un carácter especial."
