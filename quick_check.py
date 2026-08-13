import sys
sys.path.insert(0, r'C:\Users\hawpe\CascadeProjects\soulmate')
from soulmovies_helper import check_status

s = check_status('66815550-89f')
print(f"Status: {s['status']}  Progress: {s['progress']:.2f}")
