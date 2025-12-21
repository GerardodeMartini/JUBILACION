
from api.models import Agent
from django.db.models import Count

def clean():
    print("Starting cleanup...")
    
    # 1. Delete invalid DNIs
    deleted_invalid, _ = Agent.objects.filter(dni='-').delete()
    print(f"Deleted {deleted_invalid} agents with DNI '-'")
    
    deleted_empty, _ = Agent.objects.filter(dni='').delete()
    print(f"Deleted {deleted_empty} agents with empty DNI")
    
    # 2. Deduplicate remaining
    # Find DNIs that have more than 1 entry
    duplicates = Agent.objects.values('dni').annotate(count=Count('id')).filter(count__gt=1)
    
    total_dupes_removed = 0
    for entry in duplicates:
        dni = entry['dni']
        # Get all agents with this DNI, ordered by creation (latest last)
        # We keep the latest one
        agents = list(Agent.objects.filter(dni=dni).order_by('created_at'))
        
        # Keep the last one, delete the rest
        to_delete = agents[:-1]
        for a in to_delete:
            a.delete()
            total_dupes_removed += 1
            
    print(f"Removed {total_dupes_removed} duplicate records.")
    print(f"Final Agent Count: {Agent.objects.count()}")

clean()
