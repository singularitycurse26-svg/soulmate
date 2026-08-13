import paramiko
import time
import json

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

SCRIPT = (
    "In Time 2: The Revolution. "
    "Months after Will Salas and Sylvia Weis redistributed a million years of time to the people of Dayton, the city has transformed. "
    "Factories stand empty. People walk the streets with years on their clocks for the first time in history. "
    "Will Salas and Sylvia Weis have become legendary figures known as the Time Liberators, their faces painted on walls across the ghetto. "
    "But the celebration is short-lived. In New Greenwich, the wealthy elite have not forgotten. "
    "Philippe Weis, humiliated and stripped of his fortune, has rebuilt his empire from the shadows. "
    "He has created a new enforcement force called the Eternals, soldiers given centuries of time, making them nearly invincible. "
    "Their mission is to reclaim every stolen second by any means necessary. "
    "The Eternals sweep through Dayton in armored vehicles, their forearms glowing with decades of time. "
    "They raid homes, steal time from civilians at gunpoint, and drag people into the street. "
    "Families watch helplessly as their life clocks are drained back to hours. "
    "Will witnesses an Eternal squad attacking a neighborhood market, forcing people to transfer their time at gunpoint. "
    "He intervenes, fighting the Eternals with desperate fury, but they are too powerful, too well-trained, and they have unlimited time. "
    "Will barely escapes with his life, his clock down to mere hours. "
    "Sylvia finds him bleeding in an alley. She transfers time to him, saving his life. "
    "They retreat to an abandoned factory on the outskirts of Dayton, now their hidden base of operations. "
    "There they meet Vera, a fierce young resistance fighter from the Dayton underground. "
    "Vera has been tracking the Eternals movements and has discovered something terrifying. "
    "Philippe Weis is not just reclaiming time. He is building a massive time vault, a fortress called The Eternity Engine. "
    "This machine can drain time from entire populations at once, wirelessly, using the same genetic technology that created the time clocks. "
    "Once activated, it will drain every person in Dayton simultaneously, transferring all their time to Philippe and the elite. "
    "Will, Sylvia, and Vera form a plan. They must destroy The Eternity Engine before it goes online. "
    "Sylvia uses her knowledge of her father's technology to hack into the New Greenwich security network. "
    "She discovers the Engine is housed in a massive skyscraper in the heart of New Greenwich, guarded by hundreds of Eternals. "
    "Will and Vera train resistance fighters in the abandoned factory, teaching them combat and time-transfer tactics. "
    "The resistance grows as news spreads. People from other time zones arrive to join the fight. "
    "A montage of preparation: fighters cleaning weapons, Sylvia working on computers, Will strategizing on maps, Vera rallying troops. "
    "The night of the assault arrives. Will, Sylvia, and Vera lead a convoy of resistance fighters toward the New Greenwich border. "
    "They blast through the border checkpoint in stolen armored vehicles, exchanging fire with Eternal guards. "
    "The streets of New Greenwich erupt in chaos as resistance fighters pour through the breach. "
    "Will and Sylvia fight their way into the Eternity Engine tower, taking down Eternals floor by floor. "
    "Vera provides cover fire from the ground as they ascend. "
    "On the upper floors, Will encounters Marcus Cole, the leader of the Eternals, a towering figure with centuries of time on his clock. "
    "Will and Marcus engage in a brutal hand-to-hand combat sequence, trading blows in a glass-walled office overlooking the city. "
    "Marcus overpowers Will, pinning him down, preparing to drain his time. "
    "Sylvia appears and shoots Marcus in the arm, giving Will the opening he needs. "
    "Will grabs Marcus's arm and reverses the time transfer, draining decades from the Eternal leader. "
    "Marcus collapses, his clock hitting zero, and he times out on the floor. "
    "Will and Sylvia reach the top floor where The Eternity Engine hums with stolen time. "
    "The machine is a massive circular device, glowing blue, connected to thousands of time capsules. "
    "Philippe Weis stands before it, guarded by his last remaining Eternals. "
    "Philippe pleads with Sylvia, offering her immortality, offering her a place at his side. "
    "Sylvia looks at Will, then back at her father. She raises her gun. "
    "A firefight erupts. Will and Sylvia take cover behind pillars as Eternals open fire. "
    "Vera and resistance fighters arrive from the elevator, flanking the Eternals. "
    "In the chaos, Will sprints toward the Engine's control panel. "
    "An Eternal shoots him in the shoulder. Will keeps running, blood soaking his shirt. "
    "He reaches the panel and enters the override code Sylvia gave him. "
    "The Engine begins to destabilize, glowing red, shaking the entire building. "
    "Philippe screams in rage as his life's work crumbles before him. "
    "Sylvia grabs her father and forces him toward the exit, saving his life despite everything. "
    "Will, bleeding heavily, stumbles toward Sylvia. His clock is ticking down. "
    "Sylvia reaches him and transfers years of time to him, stabilizing his clock. "
    "The Eternity Engine explodes in a cascade of blue light, releasing millions of years of time into the atmosphere. "
    "The energy spreads across the sky like an aurora, visible from every time zone. "
    "Across the world, people look up as their clocks surge with new time. "
    "In Dayton, children point at the glowing sky. In New Greenwich, the wealthy watch in horror as their monopoly dissolves. "
    "The time zone borders flicker and fail as the system that enforced them collapses. "
    "Will and Sylvia stand on the rooftop of the ruined tower, watching the aurora of time spread across the horizon. "
    "Vera and the resistance fighters celebrate below, embracing, crying, laughing. "
    "Will looks at Sylvia. She looks at him. They share a quiet moment of victory. "
    "Below them, the city is changing. People from different zones are crossing borders freely for the first time. "
    "A news broadcast shows factories reopening under worker control, communities sharing time voluntarily, people living without fear. "
    "Will and Sylvia walk down from the tower, hand in hand, into a city that is finally free. "
    "The camera pulls back to show the aurora of time fading into a new dawn, the first sunrise of a world without time zones. "
    "In Time 2: The Revolution. The fight for time is over. The fight for the future has just begun."
)

payload = json.dumps({
    "text_description": SCRIPT,
    "style": "cinematic",
    "duration_s": 1800,
    "resolution": "1080p"
})

print(f"Script: {len(SCRIPT)} chars, ~{len(SCRIPT.split())} words")
print(f"Payload: {len(payload)} chars")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Write payload to file on VPS
sftp = c.open_sftp()
with sftp.open("/tmp/intime2_payload.json", "w") as f:
    f.write(payload)
sftp.close()
print("Payload uploaded to VPS")

# Submit using curl with file
print("\n=== Submitting In Time 2: The Revolution (30 min) ===")
_, stdout, stderr = c.exec_command(
    "curl -s -X POST http://localhost:8546/v1/soulmovies/create "
    "-H 'Content-Type: application/json' "
    "-d @/tmp/intime2_payload.json"
)
resp = stdout.read().decode()
err = stderr.read().decode()
print(f"Response: {resp[:300]}")
if err:
    print(f"Stderr: {err[:200]}")

# Check server log for errors
_, stdout, _ = c.exec_command("tail -10 /tmp/api_server.log")
print(f"\nServer log:\n{stdout.read().decode()}")

try:
    data = json.loads(resp)
    pid = data.get("project_id")
    print(f"\nProject ID: {pid}")
except:
    print("Failed to parse response, checking server log...")
    _, stdout, _ = c.exec_command("tail -30 /tmp/api_server.log")
    print(stdout.read().decode())
    c.close()
    exit(1)

print(f"\n30-minute video = ~180 scenes at 10s each")
print(f"Estimated generation time: 60-120 minutes")
print(f"Polling every 60 seconds...\n")

# Poll status
last_progress = -1
last_status = ""
for i in range(180):  # up to 3 hours
    time.sleep(60)
    _, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
    status = stdout.read().decode()
    try:
        sdata = json.loads(status)
        progress = sdata['progress']
        status_str = sdata['status']
        if progress != last_progress or status_str != last_status:
            elapsed = i * 60
            mins = elapsed // 60
            secs = elapsed % 60
            print(f"  [{mins}m{secs}s] status={status_str} progress={progress:.2f}")
            last_progress = progress
            last_status = status_str
        if status_str in ('complete', 'failed'):
            break
    except:
        print(f"  [{i}m] raw: {status[:100]}")

# Final result
_, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
final = json.loads(stdout.read().decode())
print(f"\n=== FINAL ===")
print(f"Status: {final['status']}")
print(f"Progress: {final['progress']}")
print(f"Output: {final.get('output_path', 'none')}")

if final.get('output_path'):
    _, stdout, _ = c.exec_command(f"ls -lh {final['output_path']} 2>&1")
    print(f"File: {stdout.read().decode()}")
    
    _, stdout, _ = c.exec_command(f"curl -s -o /dev/null -w '%{{http_code}} %{{size_download}} %{{content_type}}' http://localhost:8546/v1/soulmovies/download/{pid}")
    print(f"Download: {stdout.read().decode()}")

# Tier logs
_, stdout, _ = c.exec_command("grep -i 'tier\\|image\\|scene\\|stitch' /tmp/api_server.log | tail -30")
print(f"\n=== Generation logs ===")
print(stdout.read().decode())

c.close()
print("\nDone!")
