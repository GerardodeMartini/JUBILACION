
from api.models import Agent
from django.db.models import Count

def check():
    print(f"Total Agents: {Agent.objects.count()}")
    
    # Check for DNI duplicates
    duplicates = Agent.objects.values('dni').annotate(count=Count('id')).filter(count__gt=1)
    print(f"Duplicate DNIs found: {duplicates.count()}")
    
    for d in duplicates[:10]:
        print(f"DNI: {d['dni']}, Count: {d['count']}")
        
    # Check for empty/null DNIs
    nulls = Agent.objects.filter(dni__isnull=True).count()
    empties = Agent.objects.filter(dni='').count()
    print(f"NULL DNIs: {nulls}")
    print(f"Empty String DNIs: {empties}")

check()
